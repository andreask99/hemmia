import Capacitor
import Foundation
import Security

/// open(): shell only, starts a saved hub. showShell(): returns to the shell. launchInfo():
/// shell only. iOS injects the bridge into every main-frame page, so each call checks the
/// calling page's origin natively (SECURITY.md §7).
@objc(HubLauncherPlugin)
public class HubLauncherPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HubLauncherPlugin"
    public let jsName = "HubLauncher"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showShell", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "launchInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSensitive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stagePhoneExport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePhoneExport", returnType: CAPPluginReturnPromise),
    ]

    /// "Move to a home hub" (PHONE-MODE.md §8, SECURITY.md §7.1): the shell stages its export for
    /// one hub; that hub's page takes it once with the token, within 5 minutes. Memory only.
    private struct StagedExport {
        let hubHost: String
        let token: String
        let json: String
        let expiresAt: Date
    }
    private static var staged: StagedExport?
    private static let maxExportChars = 150 * 1024 * 1024

    private static let pathPattern = try! NSRegularExpression(
        pattern: "^/(join|import|push-open)?(#[A-Za-z0-9~_-]{1,200})?$")
    private static let refPattern = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{1,200}$")
    private static let hostPattern = try! NSRegularExpression(pattern: "^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$")

    private enum Caller { case shell, currentHub, other }

    /// The bundled demo: the hub's web app with a made-up family, never the shell.
    static func isDemo(_ url: URL) -> Bool {
        return url.path == "/demo" || url.path.hasPrefix("/demo/")
    }

    /// Runs `body` on the main thread with the controller and who is calling.
    private func withCaller(_ call: CAPPluginCall, _ body: @escaping (HubBridgeViewController, Caller) -> Void) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? HubBridgeViewController,
                let url = self.bridge?.webView?.url
            else {
                call.reject("not available")
                return
            }
            let origin = url.host.map { h in url.port.map { "\(h):\($0)" } ?? h }
            // The bundled demo (/demo/) is not the shell: no keys, no hub launching (security
            // review 2026-11-08).
            if vc.hubHost == nil && url.scheme == "capacitor" && url.host == "localhost" && !Self.isDemo(url) {
                body(vc, .shell)
            } else if let hub = vc.hubHost, url.scheme == "https", origin == hub {
                body(vc, .currentHub)
            } else {
                body(vc, .other)
            }
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller == .shell else { return call.reject("not allowed") }
            let host = call.getString("hubHost") ?? ""
            let path = call.getString("path") ?? "/"
            guard Self.matches(Self.pathPattern, path), self.isAllowed(host, vc) else {
                return call.reject("not a saved hub")
            }
            call.resolve()
            vc.openHub(host: host, path: path)
        }
    }

    @objc func showShell(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller != .other else { return call.reject("not allowed") }
            let push = call.getObject("push")
            if let hub = push?["hubHost"] as? String, let ref = push?["ref"] as? String,
                Self.matches(Self.refPattern, ref), self.isAllowed(hub, vc)
            {
                call.resolve()
                return vc.showShell(reason: "push", push: (hub, ref))
            }
            call.resolve()
            vc.showShell(reason: "switch")
        }
    }

    @objc func launchInfo(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller == .shell else { return call.reject("not allowed") }
            let push: Any = vc.pendingPush.map { ["hubHost": $0.0, "ref": $0.1] } ?? NSNull()
            call.resolve([
                "reason": vc.launchReason, "hubHost": vc.previousHubHost ?? NSNull(), "link": vc.pendingLink ?? NSNull(),
                "push": push,
            ])
            vc.pendingLink = nil
            vc.pendingPush = nil
        }
    }

    @objc func stagePhoneExport(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller == .shell else { return call.reject("not allowed") }
            guard let host = call.getString("hubHost"), let json = call.getString("json"),
                json.utf16.count <= Self.maxExportChars, self.isAllowed(host, vc)
            else { return call.reject("bad export") }
            var raw = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, raw.count, &raw) == errSecSuccess else {
                return call.reject("no randomness")
            }
            let token = Data(raw).base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
            Self.staged = StagedExport(hubHost: host, token: token, json: json, expiresAt: Date().addingTimeInterval(300))
            call.resolve(["token": token])
        }
    }

    @objc func takePhoneExport(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller == .currentHub, let staged = Self.staged, let token = call.getString("token"),
                staged.hubHost == vc.hubHost, Date() < staged.expiresAt,
                Self.constantTimeEqual(Array(staged.token.utf8), Array(token.utf8))
            else { return call.reject("not allowed") }
            Self.staged = nil
            call.resolve(["json": staged.json])
        }
    }

    private static func constantTimeEqual(_ a: [UInt8], _ b: [UInt8]) -> Bool {
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<a.count { diff |= a[i] ^ b[i] }
        return diff == 0
    }

    @objc func setSensitive(_ call: CAPPluginCall) {
        withCaller(call) { vc, caller in
            guard caller != .other else { return call.reject("not allowed") }
            vc.sensitive = call.getBool("on") ?? false
            call.resolve()
        }
    }

    private static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
        return re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
    }

    /// Saved by the shell (Preferences, which hub pages can also write) and matching this
    /// build's hub host patterns (capacitor.config.ts plugins.HubLauncher.hubHosts).
    private func isAllowed(_ hubHost: String, _ vc: HubBridgeViewController) -> Bool {
        guard Self.matches(Self.hostPattern, hubHost) else { return false }
        let name = String(hubHost.split(separator: ":").first ?? "")
        let patterns = (getConfig().getArray("hubHosts") ?? []).compactMap { $0 as? String }
        let patternOK = patterns.contains { p in
            p.hasPrefix("*.") ? name.hasSuffix(String(p.dropFirst(1))) : name == p
        }
        guard patternOK,
            let json = UserDefaults.standard.string(forKey: "CapacitorStorage.hubs.v1"),
            let data = json.data(using: .utf8),
            let hubs = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return false }
        return hubs.contains { ($0["hubHost"] as? String) == hubHost }
    }
}
