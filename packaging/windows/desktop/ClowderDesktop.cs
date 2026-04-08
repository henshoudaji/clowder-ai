using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDPIAware();

    [DllImport("shcore.dll", SetLastError = true)]
    private static extern int SetProcessDpiAwareness(int awareness);

    private const string InstanceMutexName = @"Local\OfficeClaw.WebView2Desktop";
    private const string ActivationEventName = @"Local\OfficeClaw.WebView2Desktop.Activate";

    private static void EnableHighDpi()
    {
        try
        {
            // PROCESS_PER_MONITOR_DPI_AWARE = 2
            SetProcessDpiAwareness(2);
        }
        catch
        {
            // Fallback for Windows 7 / early Win8
            try { SetProcessDPIAware(); } catch { }
        }
    }


    [STAThread]
    private static void Main()
    {
        EnableHighDpi();

        EventWaitHandle activationEvent;
        try
        {
            activationEvent = EventWaitHandle.OpenExisting(ActivationEventName);
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            activationEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivationEventName);
        }

        using (activationEvent)
        {
            bool createdNew;
            using (var mutex = new Mutex(true, InstanceMutexName, out createdNew))
            {
                if (!createdNew)
                {
                    activationEvent.Set();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm(activationEvent));
            }
        }
    }
}

internal sealed class LauncherForm : Form
{
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPlacement(IntPtr hWnd, [In] ref WINDOWPLACEMENT lpwndpl);

    private const int SW_RESTORE = 9;
    private const int SW_SHOWMINIMIZED = 2;

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPLACEMENT
    {
        public int length;
        public int flags;
        public int showCmd;
        public POINT ptMinPosition;
        public POINT ptMaxPosition;
        public RECT rcNormalPosition;
    }

    private readonly object _logLock = new object();
    private readonly NotifyIcon _notifyIcon;
    private readonly Panel _statusPanel;
    private readonly PictureBox _splashBox;
    private readonly System.Windows.Forms.Timer _spinnerTimer;
    private readonly EventWaitHandle _activationEvent;
    private readonly RegisteredWaitHandle _activationWaitHandle;
    private readonly string _projectRoot;
    private readonly string _logFilePath;
    private readonly string _runtimeStatePath;
    private const float SplashStatusAnchorX = 0.5f;
    private const float SplashStatusAnchorY = 0.8f;
    private const float SplashStatusBaseFontSize = 22f;
    private const float SplashStatusMinScale = 0.75f;
    private const float SplashStatusMaxScale = 1.35f;
    private Process _serviceHostProcess;
    private bool _serviceStartedByLauncher;
    private bool _exitRequested;
    private bool _trayHintShown;
    private bool _isHiddenToTray;
    private bool _hasTrayRestorePlacement;
    private WINDOWPLACEMENT _trayRestorePlacement;
    private string _frontendUrl;
    private string _statusText = "加载中...";
    private int _spinnerAngle;
    private WebView2 _webView;
    private Image _splashImage;

    public LauncherForm(EventWaitHandle activationEvent)
    {
        _activationEvent = activationEvent;
        _activationWaitHandle = ThreadPool.RegisterWaitForSingleObject(
            _activationEvent,
            (_, __) => RestoreFromExternalActivation(),
            null,
            Timeout.Infinite,
            false
        );
        _projectRoot = ResolveProjectRoot();
        _logFilePath = Path.Combine(_projectRoot, "logs", "desktop-launcher.log");
        _runtimeStatePath = Path.Combine(_projectRoot, ".cat-cafe", "run", "windows", "runtime-state.json");
        Directory.CreateDirectory(Path.GetDirectoryName(_logFilePath) ?? _projectRoot);
        _frontendUrl = BuildFrontendUrl();

        Text = string.Empty;
        ShowIcon = false;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        ClientSize = new Size(1440, 960);
        WindowState = FormWindowState.Maximized;
        Icon = ResolveAppIcon();
        _notifyIcon = CreateNotifyIcon();
        _trayRestorePlacement = CreateEmptyWindowPlacement();

        _splashBox = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Normal,
            BackColor = Color.Black,
        };
        _splashBox.Paint += OnSplashPaint;

        var splashImagePath = Path.Combine(_projectRoot, "assets", "splash.jpg");
        if (File.Exists(splashImagePath))
        {
            try { _splashImage = Image.FromFile(splashImagePath); }
            catch { /* fall back to plain background */ }
        }

        _statusPanel = new DoubleBufferedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
        };
        _statusPanel.Paint += OnStatusPanelPaint;

        _spinnerTimer = new System.Windows.Forms.Timer { Interval = 40 };
        _spinnerTimer.Tick += (_, __) =>
        {
            _spinnerAngle = (_spinnerAngle + 10) % 360;
            if (_statusPanel != null && !_statusPanel.IsDisposed)
            {
                _statusPanel.Invalidate();
            }
        };
        _spinnerTimer.Start();

        _splashBox.Controls.Add(_statusPanel);
        _statusPanel.BringToFront();
        _splashBox.Resize += (_, __) =>
        {
            RepositionStatusLabel();
            _splashBox.Invalidate();
        };
        Controls.Add(_splashBox);
        RepositionStatusLabel();
        Shown += async (_, __) => await InitializeAsync();
        FormClosing += OnFormClosing;
        FormClosed += (_, __) => DisposeNotifyIcon();
    }

    private async Task InitializeAsync()
    {
        try
        {
            UpdateStatus("Checking local workspace services...");
            AppendLog("Launcher boot started.");
            TryRefreshFrontendUrlFromRuntimeState();

            if (!await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                UpdateStatus("Starting local services...");
                StartManagedServices();
                _serviceStartedByLauncher = true;
            }
            else
            {
                AppendLog("Frontend already running - reusing existing services.");
            }

            UpdateStatus("Waiting for UI...");
            await WaitForFrontendAsync(TimeSpan.FromMinutes(2)).ConfigureAwait(true);

            UpdateStatus("Opening desktop window...");
            await InitializeWebViewAsync().ConfigureAwait(true);
            AppendLog("Desktop window ready.");
        }
        catch (Exception ex)
        {
            AppendLog("Launcher failed: " + ex);
            MessageBox.Show(
                this,
                ex.Message + Environment.NewLine + Environment.NewLine + "See log: " + _logFilePath,
                "OfficeClaw",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            RequestExit();
        }
    }

    private static string ResolveProjectRoot()
    {
        return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private string BuildFrontendUrl()
    {
        if (TryRefreshFrontendUrlFromRuntimeState())
        {
            return _frontendUrl;
        }

        var port = ReadPortFromEnv("FRONTEND_PORT", 3003);
        return "http://127.0.0.1:" + port + "/";
    }

    private Icon ResolveAppIcon()
    {
        try
        {
            var icoPath = Path.Combine(_projectRoot, "assets", "app.ico");
            if (File.Exists(icoPath))
            {
                return new Icon(icoPath);
            }
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            return SystemIcons.Application;
        }
    }

    private NotifyIcon CreateNotifyIcon()
    {
        var contextMenu = new ContextMenuStrip();
        contextMenu.ShowImageMargin = false;
        contextMenu.Items.Add("打开 OfficeClaw", null, (_, __) => RestoreFromExternalActivation());
        contextMenu.Items.Add("退出", null, (_, __) => RequestExit());

        var notifyIcon = new NotifyIcon
        {
            Text = "OfficeClaw",
            Visible = true,
            Icon = Icon ?? SystemIcons.Application,
            ContextMenuStrip = contextMenu,
        };
        notifyIcon.DoubleClick += (_, __) => RestoreFromExternalActivation();
        return notifyIcon;
    }

    private void DisposeNotifyIcon()
    {
        _activationWaitHandle.Unregister(null);
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }

    private void OnFormClosing(object sender, FormClosingEventArgs eventArgs)
    {
        if (!_exitRequested && eventArgs.CloseReason == CloseReason.UserClosing)
        {
            eventArgs.Cancel = true;
            HideToTray();
            return;
        }

        _notifyIcon.Visible = false;
        StopManagedServices();
    }

    private static WINDOWPLACEMENT CreateEmptyWindowPlacement()
    {
        return new WINDOWPLACEMENT
        {
            length = Marshal.SizeOf(typeof(WINDOWPLACEMENT))
        };
    }

    private void CaptureTrayRestorePlacement()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        var placement = CreateEmptyWindowPlacement();
        if (!GetWindowPlacement(Handle, ref placement))
        {
            return;
        }

        if (placement.showCmd == SW_SHOWMINIMIZED)
        {
            placement.showCmd = SW_RESTORE;
        }

        _trayRestorePlacement = placement;
        _hasTrayRestorePlacement = true;
    }

    private void RestoreFromTrayPlacement()
    {
        if (!_hasTrayRestorePlacement)
        {
            ShowWindow(Handle, SW_RESTORE);
            return;
        }

        var placement = _trayRestorePlacement;
        if (placement.showCmd == SW_SHOWMINIMIZED)
        {
            placement.showCmd = SW_RESTORE;
        }

        SetWindowPlacement(Handle, ref placement);
    }

    private void HideToTray()
    {
        CaptureTrayRestorePlacement();

        _isHiddenToTray = true;
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Hide();
        _notifyIcon.Visible = true;
        if (!_trayHintShown)
        {
            _notifyIcon.ShowBalloonTip(
                2500,
                "OfficeClaw",
                "OfficeClaw 仍在后台运行，右键托盘图标可退出。",
                ToolTipIcon.Info
            );
            _trayHintShown = true;
        }
    }

    private void RestoreFromTray()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RestoreFromTray);
            return;
        }

        _isHiddenToTray = false;
        ShowInTaskbar = true;
        Show();
        RestoreFromTrayPlacement();
        SetForegroundWindow(Handle);
        Activate();
    }


    private void RestoreFromExternalActivation()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RestoreFromExternalActivation);
            return;
        }

        if (_isHiddenToTray)
        {
            RestoreFromTray();
            return;
        }

        if (WindowState == FormWindowState.Minimized)
        {
            ShowInTaskbar = true;
            ShowWindow(Handle, SW_RESTORE);
            SetForegroundWindow(Handle);
            return;
        }

        if (!Visible)
        {
            Show();
        }

        ShowInTaskbar = true;
        Activate();
    }


    private void RequestExit()
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke((Action)RequestExit);
            return;
        }

        if (_exitRequested)
        {
            return;
        }

        _exitRequested = true;
        ShowInTaskbar = true;
        Close();
    }

    private int ReadPortFromEnv(string key, int fallback)
    {
        try
        {
            var envPath = Path.Combine(_projectRoot, ".env");
            if (!File.Exists(envPath))
            {
                return fallback;
            }

            foreach (var rawLine in File.ReadAllLines(envPath))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
                {
                    continue;
                }

                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0)
                {
                    continue;
                }

                var candidateKey = line.Substring(0, separatorIndex).Trim();
                if (!string.Equals(candidateKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var value = line.Substring(separatorIndex + 1).Trim().Trim('"').Trim('\'');
                int port;
                if (int.TryParse(value, out port) && port > 0)
                {
                    return port;
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading .env: " + ex.Message);
        }

        return fallback;
    }

    private bool TryRefreshFrontendUrlFromRuntimeState()
    {
        string runtimeUrl;
        if (TryReadRuntimeStateValue("FrontendUrl", out runtimeUrl) && !string.IsNullOrWhiteSpace(runtimeUrl))
        {
            _frontendUrl = runtimeUrl.Trim();
            return true;
        }

        string runtimePort;
        if (TryReadRuntimeStateValue("WebPort", out runtimePort))
        {
            int port;
            if (int.TryParse(runtimePort, out port) && port > 0)
            {
                _frontendUrl = "http://127.0.0.1:" + port + "/";
                return true;
            }
        }

        return false;
    }

    private bool TryReadRuntimeStateValue(string key, out string value)
    {
        value = null;
        try
        {
            if (!File.Exists(_runtimeStatePath))
            {
                return false;
            }

            var content = File.ReadAllText(_runtimeStatePath);
            var pattern =
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*(?:\"(?<text>(?:\\\\.|[^\"])*)\"|(?<number>\\d+)|null)";
            var match = Regex.Match(content, pattern);
            if (!match.Success)
            {
                return false;
            }

            if (match.Groups["text"].Success)
            {
                value = Regex.Unescape(match.Groups["text"].Value);
                return true;
            }

            if (match.Groups["number"].Success)
            {
                value = match.Groups["number"].Value;
                return true;
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading runtime state: " + ex.Message);
        }

        return false;
    }

    private void StartManagedServices()
    {
        var startScript = Path.Combine(_projectRoot, "scripts", "start-windows.ps1");
        if (!File.Exists(startScript))
        {
            throw new FileNotFoundException("Missing startup script: " + startScript);
        }

        var info = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + startScript + "\" -Quick",
            WorkingDirectory = _projectRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        _serviceHostProcess = new Process
        {
            StartInfo = info,
            EnableRaisingEvents = true,
        };

        _serviceHostProcess.OutputDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.ErrorDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start:err] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.Exited += (_, __) =>
        {
            AppendLog("Service host exited with code " + _serviceHostProcess.ExitCode + ".");
        };

        if (!_serviceHostProcess.Start())
        {
            throw new InvalidOperationException("Failed to start local services.");
        }

        _serviceHostProcess.BeginOutputReadLine();
        _serviceHostProcess.BeginErrorReadLine();
        AppendLog("Started service host via start-windows.ps1.");
    }

    private async Task WaitForFrontendAsync(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            TryRefreshFrontendUrlFromRuntimeState();
            if (await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                return;
            }

            if (_serviceStartedByLauncher && _serviceHostProcess != null && _serviceHostProcess.HasExited)
            {
                throw new InvalidOperationException(
                    "Local services exited before the UI became ready. Check " + _logFilePath + " for details."
                );
            }

            await Task.Delay(1000).ConfigureAwait(true);
        }

        throw new TimeoutException("Timed out waiting for the frontend at " + _frontendUrl);
    }

    private Task<bool> IsFrontendReadyAsync()
    {
        return Task.Run(() =>
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(_frontendUrl);
                request.Method = "GET";
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.AllowAutoRedirect = true;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        });
    }

    private async Task InitializeWebViewAsync()
    {
        var userDataFolder = Path.Combine(_projectRoot, ".cat-cafe", "webview2");
        Directory.CreateDirectory(userDataFolder);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = userDataFolder,
            },
        };

        _spinnerTimer.Stop();
        _spinnerTimer.Dispose();
        Controls.Clear();
        if (_splashImage != null)
        {
            _splashImage.Dispose();
            _splashImage = null;
        }
        _splashBox.Dispose();
        Controls.Add(_webView);

        await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);

        var settings = _webView.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.AreDevToolsEnabled = false;
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsSwipeNavigationEnabled = false;

        _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
        _webView.CoreWebView2.ProcessFailed += (_, eventArgs) =>
        {
            AppendLog("WebView2 process failed: " + eventArgs.ProcessFailedKind);
        };
        _webView.Source = new Uri(_frontendUrl);
    }

    private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
    {
        eventArgs.Handled = true;
        try
        {
            Process.Start(new ProcessStartInfo(eventArgs.Uri) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            AppendLog("Failed to open external link: " + ex.Message);
        }
    }

    private void StopManagedServices()
    {
        try
        {
            var stopScript = Path.Combine(_projectRoot, "scripts", "stop-windows.ps1");
            if (File.Exists(stopScript))
            {
                var stopInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + stopScript + "\"",
                    WorkingDirectory = _projectRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                using (var stopProcess = Process.Start(stopInfo))
                {
                    if (stopProcess != null && !stopProcess.WaitForExit(15000))
                    {
                        stopProcess.Kill();
                    }
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed stopping services cleanly: " + ex.Message);
        }
        finally
        {
            try
            {
                if (_serviceHostProcess != null && !_serviceHostProcess.HasExited)
                {
                    _serviceHostProcess.Kill();
                    _serviceHostProcess.WaitForExit(5000);
                }
            }
            catch (Exception ex)
            {
                AppendLog("Failed terminating service host: " + ex.Message);
            }
        }
    }

    private void UpdateStatus(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)(() => UpdateStatus(message)));
            return;
        }

        _statusText = "加载中...";
        _statusPanel.Invalidate();
        AppendLog(message);
    }

    private void AppendLog(string message)
    {
        lock (_logLock)
        {
            File.AppendAllText(
                _logFilePath,
                DateTime.Now.ToString("u") + " " + message + Environment.NewLine,
                Encoding.UTF8
            );
        }
    }

    private void RepositionStatusLabel()
    {
        if (_statusPanel == null || _statusPanel.IsDisposed)
        {
            return;
        }

        _statusPanel.Invalidate();
    }

    private RectangleF GetSplashImageBounds(Size canvas)
    {
        if (_splashImage == null || canvas.Width <= 0 || canvas.Height <= 0)
        {
            return RectangleF.Empty;
        }

        var img = _splashImage;
        float scale = Math.Max(
            (float)canvas.Width / img.Width,
            (float)canvas.Height / img.Height
        );

        float scaledW = img.Width * scale;
        float scaledH = img.Height * scale;
        float x = (canvas.Width - scaledW) / 2f;
        float y = (canvas.Height - scaledH) / 2f;
        return new RectangleF(x, y, scaledW, scaledH);
    }

    private float GetSplashOverlayScale(RectangleF imageBounds)
    {
        if (_splashImage == null || imageBounds.IsEmpty)
        {
            return 1f;
        }

        float scaleX = imageBounds.Width / _splashImage.Width;
        float scaleY = imageBounds.Height / _splashImage.Height;
        float scale = Math.Min(scaleX, scaleY);
        return Math.Max(SplashStatusMinScale, Math.Min(SplashStatusMaxScale, scale));
    }

    private void OnSplashPaint(object sender, PaintEventArgs eventArgs)
    {
        if (_splashImage == null)
        {
            return;
        }

        var imageBounds = GetSplashImageBounds(((Control)sender).ClientSize);
        if (imageBounds.IsEmpty)
        {
            return;
        }

        eventArgs.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        eventArgs.Graphics.DrawImage(_splashImage, imageBounds);
    }

    private void OnStatusPanelPaint(object sender, PaintEventArgs eventArgs)
    {
        if (_splashImage == null)
        {
            return;
        }

        var panel = (Panel)sender;
        var g = eventArgs.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var imageBounds = GetSplashImageBounds(panel.ClientSize);
        if (imageBounds.IsEmpty)
        {
            return;
        }

        float overlayScale = GetSplashOverlayScale(imageBounds);
        float fontSize = SplashStatusBaseFontSize * overlayScale;
        float spinnerSize = 24f * overlayScale;
        float gap = 10f * overlayScale;
        float strokeWidth = Math.Max(2f, 2.5f * overlayScale);

        using (var font = new Font("Segoe UI", fontSize, FontStyle.Regular, GraphicsUnit.Pixel))
        {
            var textSize = g.MeasureString(_statusText, font);
            float totalWidth = spinnerSize + gap + textSize.Width;
            float anchorX = imageBounds.Left + imageBounds.Width * SplashStatusAnchorX;
            float anchorY = imageBounds.Top + imageBounds.Height * SplashStatusAnchorY;
            float startX = anchorX - totalWidth / 2f;
            float spinnerY = anchorY - spinnerSize / 2f;
            float textX = startX + spinnerSize + gap;
            float textY = anchorY - textSize.Height / 2f;

            var spinnerColor = Color.FromArgb(255, 128, 0);
            var textColor = Color.FromArgb(51, 51, 51);

            using (var pen = new Pen(spinnerColor, strokeWidth))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                g.DrawArc(pen, startX, spinnerY, spinnerSize, spinnerSize, _spinnerAngle, 270);
            }

            using (var brush = new SolidBrush(textColor))
            {
                g.DrawString(_statusText, font, brush, textX, textY);
            }
        }
    }
}

internal sealed class DoubleBufferedPanel : Panel
{
    public DoubleBufferedPanel()
    {
        SetStyle(
            ControlStyles.UserPaint |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.OptimizedDoubleBuffer,
            true
        );
    }
}
