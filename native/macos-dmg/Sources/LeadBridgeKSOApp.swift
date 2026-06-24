import Cocoa
import WebKit

private let appName = "LeadBridge KSO"
private let appVersion = "v6.4.24.1144"
private let gitHubPagesURL = URL(string: "https://frankiej13.github.io/leadbridge-kso/")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var triedOfflineFallback = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        configureWindow()
        openGitHubPages()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1360, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "\(appName) \(appVersion)"
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(title: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let navigationItem = NSMenuItem()
        let navigationMenu = NSMenu(title: "Navigate")
        let openPages = NSMenuItem(title: "Open GitHub Pages", action: #selector(openGitHubPagesMenu), keyEquivalent: "g")
        openPages.target = self
        navigationMenu.addItem(openPages)

        let openOffline = NSMenuItem(title: "Open Offline Copy", action: #selector(openOfflineMenu), keyEquivalent: "o")
        openOffline.target = self
        navigationMenu.addItem(openOffline)

        navigationMenu.addItem(.separator())

        let reload = NSMenuItem(title: "Reload", action: #selector(reloadMenu), keyEquivalent: "r")
        reload.target = self
        navigationMenu.addItem(reload)

        navigationItem.submenu = navigationMenu
        mainMenu.addItem(navigationItem)

        NSApp.mainMenu = mainMenu
    }

    private func openGitHubPages() {
        triedOfflineFallback = false
        webView.load(URLRequest(url: gitHubPagesURL, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 20))
    }

    private func openOfflineCopy() {
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            showAlert(message: "Offline HTML not found inside the app bundle.")
            return
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fallbackToOfflineOnce(error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fallbackToOfflineOnce(error: error)
    }

    private func fallbackToOfflineOnce(error: Error) {
        if triedOfflineFallback {
            showAlert(message: "Navigation failed:\n\(error.localizedDescription)")
            return
        }
        triedOfflineFallback = true
        openOfflineCopy()
    }

    private func showAlert(message: String) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }

    @objc private func openGitHubPagesMenu() {
        openGitHubPages()
    }

    @objc private func openOfflineMenu() {
        openOfflineCopy()
    }

    @objc private func reloadMenu() {
        webView.reload()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
