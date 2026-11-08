import Capacitor
import UIKit
import WebKit

/// Runs either the bundled shell or one paired hub (docs/public/ARCHITECTURE.md §3.4). A hub is
/// started as the bridge's server URL (spike P5.1); switching replaces this view controller.
class HubBridgeViewController: CAPBridgeViewController {
    /// The hub this controller runs (host[:port]), or nil for the shell.
    var hubHost: String?
    var hubPath = "/"
    /// Why the shell is shown: "start", "switch", "offline" or "link", and the hub it came from.
    var launchReason = "start"
    var previousHubHost: String?
    /// A join link that arrived while a hub was running.
    var pendingLink: String?
    /// A tapped notification for another hub: (hubHost, ref).
    var pendingPush: (String, String)?
    /// Whether the page shows a recovery code or sign-in QR (hidden in the app switcher).
    var sensitive = false
    private var cover: UIView?
    private var navigationProxy: NavigationFailureProxy?

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        // Always the bundled shell, never a stored "server base path" (DisableDeploy is set too):
        // a hub page could write files and have them served as the shell origin.
        if let bundled = Bundle.main.url(forResource: "public", withExtension: nil) {
            descriptor.appLocation = bundled
        }
        if let host = hubHost {
            descriptor.serverURL = "https://\(host)\(hubPath)"
            descriptor.errorPath = nil
        }
        // Never navigate to other sites inside the app (SECURITY.md §7): links open in Safari.
        descriptor.allowedNavigationHostnames = []
        return descriptor
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let center = NotificationCenter.default
        center.addObserver(
            self, selector: #selector(coverIfSensitive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(
            self, selector: #selector(uncover), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func coverIfSensitive() {
        guard sensitive, cover == nil else { return }
        let v = UIView(frame: view.bounds)
        v.backgroundColor = .systemBackground
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(v)
        cover = v
    }

    @objc private func uncover() {
        cover?.removeFromSuperview()
        cover = nil
    }

    override func capacitorDidLoad() {
        KeyValueStore.standard["serverBasePath"] = nil as String?
        bridge?.registerPluginInstance(HubLauncherPlugin())
        bridge?.registerPluginInstance(SecureStorePlugin())
        hubPath = "/"  // a link code is not kept after start
        guard hubHost != nil, let webView = webView else { return }
        // Hub pages reach only the plugins they need (security review 2026-11-07, H2): no
        // Filesystem, Preferences, WebView, CapacitorHttp, SecureStore, App or Share.
        // Fails closed: without Capacitor's handler, hub pages get no plugins at all.
        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: "bridge")
        if let target = webView.navigationDelegate as? WKScriptMessageHandler {
            controller.add(HubPluginFilter(target: target), name: "bridge")
        }
        let proxy = NavigationFailureProxy(target: webView.navigationDelegate) { [weak self] in
            self?.showShell(reason: "offline")
        }
        navigationProxy = proxy
        webView.navigationDelegate = proxy
    }

    func openHub(host: String, path: String) {
        let next = HubBridgeViewController()
        next.hubHost = host
        next.hubPath = path
        replace(with: next)
    }

    func showShell(reason: String, link: String? = nil, push: (String, String)? = nil) {
        let next = HubBridgeViewController()
        next.launchReason = reason
        next.previousHubHost = hubHost
        next.pendingLink = link
        next.pendingPush = push
        replace(with: next)
    }

    private func replace(with next: HubBridgeViewController) {
        DispatchQueue.main.async {
            guard let window = self.view.window else { return }
            window.rootViewController = next
        }
    }
}

/// Passes a hub page's calls to Capacitor only for the plugins hub pages use
/// (apps/web/src/native/bridge.ts); everything else, including Cordova calls, is dropped.
final class HubPluginFilter: NSObject, WKScriptMessageHandler {
    static let allowed: Set<String> = ["HubLauncher", "PushNotifications", "CapacitorBarcodeScanner", "Console"]
    private let target: WKScriptMessageHandler

    init(target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let dict = message.body as? [String: Any] else { return }
        let type = dict["type"] as? String ?? ""
        if type == "js.error" || (type == "message" && Self.allowed.contains(dict["pluginId"] as? String ?? "")) {
            target.userContentController(controller, didReceive: message)
        }
    }
}

/// Forwards every navigation delegate call to Capacitor's handler and reports when the main
/// page fails to load (the hub is unreachable).
final class NavigationFailureProxy: NSObject, WKNavigationDelegate {
    private weak var target: WKNavigationDelegate?
    private let onFailure: () -> Void

    init(target: WKNavigationDelegate?, onFailure: @escaping () -> Void) {
        self.target = target
        self.onFailure = onFailure
    }

    override func responds(to aSelector: Selector!) -> Bool {
        return super.responds(to: aSelector) || (target?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        return target
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        if (error as NSError).code != NSURLErrorCancelled { onFailure() }
    }
}
