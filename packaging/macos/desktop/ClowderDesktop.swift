import Cocoa
import WebKit

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem?
    private var serviceProcess: Process?
    private var serviceStartedByLauncher = false
    private let projectRoot: String
    private let logFilePath: String
    private let runtimeStatePath: String
    private var frontendUrl: String
    private var splashView: SplashView?

    // No nib/storyboard — must wire the delegate manually.
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }

    override init() {
        let bundle = Bundle.main
        projectRoot = bundle.resourcePath ?? bundle.bundlePath
        logFilePath = NSString(string: "~/.cat-cafe/logs/desktop-launcher.log")
            .expandingTildeInPath
        runtimeStatePath = NSString(string: "~/.cat-cafe/run/macos/runtime-state.json")
            .expandingTildeInPath
        // No hardcoded port — will be read from runtime-state.json once services start.
        // Empty string signals "not yet known"; waitForFrontend polls runtime state.
        frontendUrl = ""
        super.init()
    }

    func applicationDidFinishLaunching(_: Notification) {
        ensureLogDirectory()
        setupMainMenu()
        setupStatusBarItem()
        createMainWindow()
        showSplash()
        Task { await initialize() }
    }

    // MARK: - Main Menu (enables Cmd+C/V/X/A in WKWebView)

    private func setupMainMenu() {
        let mainMenu = NSMenu()

        // App menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "About Clowder AI", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "Hide Clowder AI", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(NSMenuItem(title: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: ""))
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "Quit Clowder AI", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Edit menu — connects Cmd+C/V/X/A to the responder chain so WKWebView receives them
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Undo", action: Selector(("undo:")), keyEquivalent: "z"))
        editMenu.addItem(NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z"))
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        NSApp.mainMenu = mainMenu
    }

    func applicationShouldTerminateAfterLastWindowClosed(_: NSApplication) -> Bool {
        return false
    }

    func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func applicationWillTerminate(_: Notification) {
        stopManagedServices()
    }

    // MARK: - Window Setup

    private func createMainWindow() {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 960)
        let windowRect = NSRect(
            x: screen.midX - 720, y: screen.midY - 480,
            width: 1440, height: 960
        )

        window = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.title = "Clowder AI"
        window.minSize = NSSize(width: 960, height: 640)
        window.delegate = self
        window.center()

        if let iconPath = Bundle.main.path(forResource: "AppIcon", ofType: "icns") {
            NSApp.applicationIconImage = NSImage(contentsOfFile: iconPath)
        }
    }

    private func showSplash() {
        splashView = SplashView(frame: window.contentView!.bounds)
        splashView!.autoresizingMask = [.width, .height]
        window.contentView = splashView
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: - Status Bar

    private func setupStatusBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem?.button {
            button.image = NSImage(
                systemSymbolName: "cat.fill",
                accessibilityDescription: "Clowder AI"
            )
        }

        let menu = NSMenu()
        menu.addItem(
            NSMenuItem(title: "Show Clowder AI", action: #selector(showWindow), keyEquivalent: "")
        )
        menu.addItem(NSMenuItem.separator())
        menu.addItem(
            NSMenuItem(title: "Quit", action: #selector(quitApp), keyEquivalent: "q")
        )
        statusItem?.menu = menu
    }

    @objc private func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    // MARK: - Initialization

    private func initialize() async {
        do {
            appendLog("Launcher boot started.")
            updateSplashStatus("Checking local workspace services...")
            refreshFrontendUrlFromRuntimeState()

            if !(await isFrontendReady()) {
                updateSplashStatus("Starting local services...")
                startManagedServices()
                serviceStartedByLauncher = true
            } else {
                appendLog("Frontend already running - reusing existing services.")
            }

            updateSplashStatus("Waiting for UI...")
            try await waitForFrontend(timeout: 120)

            updateSplashStatus("Opening desktop window...")
            await MainActor.run { initializeWebView() }
            appendLog("Desktop window ready.")
        } catch {
            appendLog("Launcher failed: \(error)")
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Clowder AI"
                alert.informativeText = "\(error.localizedDescription)\n\nSee log: \(logFilePath)"
                alert.alertStyle = .critical
                alert.runModal()
                NSApp.terminate(nil)
            }
        }
    }

    // MARK: - Service Management

    private func startManagedServices() {
        let startScript = (projectRoot as NSString).appendingPathComponent("scripts/start-macos.sh")
        guard FileManager.default.fileExists(atPath: startScript) else {
            appendLog("Missing startup script: \(startScript)")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [startScript]
        process.currentDirectoryURL = URL(fileURLWithPath: projectRoot)
        process.environment = buildServiceEnvironment()

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
            self?.appendLog("[start] \(line.trimmingCharacters(in: .newlines))")
        }

        process.terminationHandler = { [weak self] proc in
            self?.appendLog("Service host exited with code \(proc.terminationStatus).")
        }

        do {
            try process.run()
            serviceProcess = process
            appendLog("Started service host via start-macos.sh.")
        } catch {
            appendLog("Failed to start services: \(error)")
        }
    }

    private func stopManagedServices() {
        guard serviceStartedByLauncher, let process = serviceProcess, process.isRunning else {
            return
        }
        appendLog("Stopping managed services...")
        process.interrupt()

        let deadline = Date().addingTimeInterval(5)
        while process.isRunning, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.2)
        }
        if process.isRunning {
            process.terminate()
            appendLog("Force-terminated service host.")
        } else {
            appendLog("Service host stopped gracefully.")
        }
    }

    private func buildServiceEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        // Clear inherited port/URL vars so bundled mode uses its own random ports,
        // not values leaked from a co-running cat-cafe dev environment.
        for key in ["REDIS_PORT", "REDIS_URL", "API_SERVER_PORT", "FRONTEND_PORT", "PORT"] {
            env.removeValue(forKey: key)
        }
        env["CAT_CAFE_RESPECT_DOTENV_PORTS"] = "1"
        env["CAT_CAFE_DIRECT_NO_WATCH"] = "1"
        env["CAT_CAFE_STRICT_PROFILE_DEFAULTS"] = "1"
        env["CAT_CAFE_MACOS_BUNDLED"] = "1"
        env["PATH"] = "\(projectRoot)/tools/node/bin:\(projectRoot)/tools/redis/bin:\(env["PATH"] ?? "")"
        return env
    }

    // MARK: - Frontend Health Check

    private func isFrontendReady() async -> Bool {
        guard let url = URL(string: frontendUrl) else { return false }
        var request = URLRequest(url: url, timeoutInterval: 1.5)
        request.httpMethod = "GET"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                return httpResponse.statusCode < 500
            }
            return false
        } catch {
            return false
        }
    }

    private func waitForFrontend(timeout: TimeInterval) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            refreshFrontendUrlFromRuntimeState()
            if await isFrontendReady() { return }

            if serviceStartedByLauncher,
               let process = serviceProcess, !process.isRunning {
                throw NSError(
                    domain: "ClowderAI", code: 1,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Local services exited before the UI became ready."]
                )
            }
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        throw NSError(
            domain: "ClowderAI", code: 2,
            userInfo: [NSLocalizedDescriptionKey:
                "Timed out waiting for the frontend at \(frontendUrl)"]
        )
    }

    // MARK: - WebView

    private func initializeWebView() {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self

        splashView = nil
        window.contentView = webView

        if let url = URL(string: frontendUrl) {
            webView.load(URLRequest(url: url))
        }
    }

    // MARK: - Runtime State

    private func refreshFrontendUrlFromRuntimeState() {
        guard FileManager.default.fileExists(atPath: runtimeStatePath),
              let data = FileManager.default.contents(atPath: runtimeStatePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }

        if let frontendPort = json["FRONTEND_PORT"] as? Int, frontendPort > 0 {
            frontendUrl = "http://127.0.0.1:\(frontendPort)/"
            return
        }
        if let portStr = json["FRONTEND_PORT"] as? String, let port = Int(portStr), port > 0 {
            frontendUrl = "http://127.0.0.1:\(port)/"
        }
    }

    // MARK: - Logging

    private func ensureLogDirectory() {
        let logDir = (logFilePath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(
            atPath: logDir, withIntermediateDirectories: true
        )
    }

    private func appendLog(_ message: String) {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let line = "[\(timestamp)] \(message)\n"
        if let handle = FileHandle(forWritingAtPath: logFilePath) {
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8) ?? Data())
            handle.closeFile()
        } else {
            FileManager.default.createFile(
                atPath: logFilePath,
                contents: line.data(using: .utf8)
            )
        }
    }

    // MARK: - Splash

    private func updateSplashStatus(_ text: String) {
        Task { @MainActor in
            splashView?.statusText = text
        }
    }
}

// MARK: - NSWindowDelegate

extension AppDelegate: NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }
}

// MARK: - WKNavigationDelegate

extension AppDelegate: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url,
           url.host != "127.0.0.1" && url.host != "localhost" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

// MARK: - Splash View

class SplashView: NSView {
    var statusText: String = "Preparing Clowder AI..." {
        didSet { needsDisplay = true }
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.black.setFill()
        dirtyRect.fill()

        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.alignment = .center

        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.systemFont(ofSize: 16, weight: .medium),
            .paragraphStyle: paragraphStyle,
        ]

        let textRect = NSRect(
            x: 20, y: bounds.midY - 40,
            width: bounds.width - 40, height: 30
        )
        statusText.draw(in: textRect, withAttributes: attrs)

        let subtitleAttrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.gray,
            .font: NSFont.systemFont(ofSize: 12),
            .paragraphStyle: paragraphStyle,
        ]
        let subtitleRect = NSRect(
            x: 20, y: bounds.midY - 70,
            width: bounds.width - 40, height: 20
        )
        "Loading services...".draw(in: subtitleRect, withAttributes: subtitleAttrs)
    }
}
