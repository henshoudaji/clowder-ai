import AppKit
import Foundation
import WebKit

private struct RuntimeState: Decodable {
    let frontendUrl: String?
}

private enum LauncherError: LocalizedError {
    case missingResource(String)
    case processFailed(String)
    case invalidRuntimeState(String)

    var errorDescription: String? {
        switch self {
        case .missingResource(let message), .processFailed(let message), .invalidRuntimeState(let message):
            return message
        }
    }
}

@main
final class LauncherApp: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private let fileManager = FileManager.default
    private var window: NSWindow?
    private var webView: WKWebView?
    private var statusLabel: NSTextField?
    private var spinner: NSProgressIndicator?

    private lazy var runtimeRootURL: URL = {
        guard let resourceURL = Bundle.main.resourceURL else {
            fatalError("Missing bundle resource URL")
        }
        return resourceURL.appendingPathComponent("runtime", isDirectory: true)
    }()

    private lazy var appSupportURL: URL = {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("ClowderAI", isDirectory: true)
    }()

    private lazy var logDirURL: URL = {
        let base = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("Logs/ClowderAI", isDirectory: true)
    }()

    private var runDirURL: URL { appSupportURL.appendingPathComponent("run", isDirectory: true) }
    private var configDirURL: URL { appSupportURL.appendingPathComponent("config", isDirectory: true) }
    private var dataDirURL: URL { appSupportURL.appendingPathComponent("data", isDirectory: true) }
    private var cacheDirURL: URL { appSupportURL.appendingPathComponent("cache", isDirectory: true) }
    private var stateFileURL: URL { runDirURL.appendingPathComponent("runtime-state.json") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureWindow()
        NSApp.activate(ignoringOtherApps: true)
        startRuntime()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopRuntime()
    }

    private func configureWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1320, height: 860)
        let window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Clowder AI"
        window.isReleasedWhenClosed = false

        let contentView = NSView(frame: rect)
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let spinner = NSProgressIndicator(frame: NSRect(x: (rect.width - 32) / 2, y: rect.height / 2 + 8, width: 32, height: 32))
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.startAnimation(nil)

        let label = NSTextField(labelWithString: "Starting bundled services...")
        label.alignment = .center
        label.frame = NSRect(x: 0, y: rect.height / 2 - 36, width: rect.width, height: 24)
        label.font = .systemFont(ofSize: 15, weight: .medium)

        contentView.addSubview(spinner)
        contentView.addSubview(label)
        window.contentView = contentView
        window.makeKeyAndOrderFront(nil)

        self.window = window
        self.spinner = spinner
        self.statusLabel = label
    }

    private func startRuntime() {
        statusLabel?.stringValue = "Starting bundled services..."
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.prepareUserDirectories()
                let frontendURL = try self.runStartScriptAndResolveURL()
                DispatchQueue.main.async {
                    self.showWebView(frontendURL)
                }
            } catch {
                let details = self.failureDetails(summary: error.localizedDescription)
                DispatchQueue.main.async {
                    self.presentFailure(details)
                }
            }
        }
    }

    private func prepareUserDirectories() throws {
        for url in [appSupportURL, logDirURL, runDirURL, configDirURL, dataDirURL, cacheDirURL] {
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    private func runStartScriptAndResolveURL() throws -> URL {
        let scriptURL = runtimeRootURL.appendingPathComponent("scripts/start-bundle.sh")
        guard fileManager.isExecutableFile(atPath: scriptURL.path) else {
            throw LauncherError.missingResource("Missing launcher script at \(scriptURL.path)")
        }

        let process = Process()
        let pipe = Pipe()
        process.executableURL = scriptURL
        process.currentDirectoryURL = runtimeRootURL
        process.standardOutput = pipe
        process.standardError = pipe
        process.environment = runtimeEnvironment()
        try process.run()
        process.waitUntilExit()

        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            throw LauncherError.processFailed(output.isEmpty ? "Bundled runtime failed to start." : output)
        }

        return try readFrontendURL()
    }

    private func runtimeEnvironment() -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["CLOWDER_APP_BUNDLE_ROOT"] = Bundle.main.bundleURL.path
        env["CLOWDER_RUNTIME_ROOT"] = runtimeRootURL.path
        env["CLOWDER_USER_HOME"] = appSupportURL.path
        env["CLOWDER_LOG_DIR"] = logDirURL.path
        env["CLOWDER_RUN_DIR"] = runDirURL.path
        env["CLOWDER_CONFIG_DIR"] = configDirURL.path
        env["CLOWDER_DATA_DIR"] = dataDirURL.path
        env["CLOWDER_CACHE_DIR"] = cacheDirURL.path
        env["MEMORY_STORE"] = env["MEMORY_STORE"] ?? "1"
        return env
    }

    private func readFrontendURL() throws -> URL {
        guard fileManager.fileExists(atPath: stateFileURL.path) else {
            throw LauncherError.invalidRuntimeState("Bundled runtime did not write runtime-state.json")
        }
        let data = try Data(contentsOf: stateFileURL)
        let state = try JSONDecoder().decode(RuntimeState.self, from: data)
        guard let frontend = state.frontendUrl, let url = URL(string: frontend) else {
            throw LauncherError.invalidRuntimeState("runtime-state.json does not contain a valid frontendUrl")
        }
        return url
    }

    private func showWebView(_ frontendURL: URL) {
        statusLabel?.removeFromSuperview()
        spinner?.stopAnimation(nil)
        spinner?.removeFromSuperview()

        let configuration = WKWebViewConfiguration()
        let webView = WKWebView(frame: window?.contentView?.bounds ?? .zero, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window?.contentView = webView
        window?.title = "Clowder AI"
        webView.load(URLRequest(url: frontendURL))
        self.webView = webView
    }

    private func presentFailure(_ details: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Clowder AI failed to start"
        alert.informativeText = details
        alert.addButton(withTitle: "OK")
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func failureDetails(summary: String) -> String {
        let apiTail = tail(of: logDirURL.appendingPathComponent("api.log"), lineCount: 20)
        let webTail = tail(of: logDirURL.appendingPathComponent("web.log"), lineCount: 20)
        return [
            summary,
            "",
            "Logs: \(logDirURL.path)",
            "",
            "API log tail:",
            apiTail,
            "",
            "Web log tail:",
            webTail,
        ].joined(separator: "\n")
    }

    private func tail(of url: URL, lineCount: Int) -> String {
        guard let content = try? String(contentsOf: url, encoding: .utf8), !content.isEmpty else {
            return "(no log output)"
        }
        let lines = content.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.suffix(lineCount).joined(separator: "\n")
    }

    private func stopRuntime() {
        let scriptURL = runtimeRootURL.appendingPathComponent("scripts/stop-bundle.sh")
        guard fileManager.isExecutableFile(atPath: scriptURL.path) else {
            return
        }

        let process = Process()
        process.executableURL = scriptURL
        process.currentDirectoryURL = runtimeRootURL
        process.environment = ["CLOWDER_RUN_DIR": runDirURL.path]
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return
        }
    }
}
