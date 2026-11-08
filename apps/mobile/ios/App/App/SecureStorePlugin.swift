import Capacitor
import Foundation
import Security

/// API keys and the phone-mode data key in the Keychain (PHONE-MODE.md §5): generic passwords
/// under service "<bundle-id>.secure", never synchronized. API keys are device-only and not in
/// backups; the data key survives an encrypted backup restore. Only the bundled shell may call
/// this: hub pages share the bridge (spike P5.1) and must never read a key.
@objc(SecureStorePlugin)
public class SecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStorePlugin"
    public let jsName = "SecureStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private static let accessibility: [String: CFString] = [
        "apiKey.anthropic": kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        "apiKey.openai": kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        "dataKey": kSecAttrAccessibleAfterFirstUnlock,
    ]
    private static let maxValueChars = 4096

    private var service: String { (Bundle.main.bundleIdentifier ?? "kchat") + ".secure" }

    /// Runs `body` with the value's name when the caller is the bundled shell.
    private func fromShell(_ call: CAPPluginCall, _ body: @escaping (String) -> Void) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? HubBridgeViewController, vc.hubHost == nil,
                let url = self.bridge?.webView?.url, url.scheme == "capacitor", url.host == "localhost",
                !HubLauncherPlugin.isDemo(url)
            else { return call.reject("not allowed") }
            guard let name = call.getString("name"), Self.accessibility[name] != nil else {
                return call.reject("unknown name")
            }
            body(name)
        }
    }

    private func query(_ name: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
            kSecAttrSynchronizable as String: kCFBooleanFalse as Any,
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        fromShell(call) { name in
            var q = self.query(name)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: AnyObject?
            let status = SecItemCopyMatching(q as CFDictionary, &out)
            if status == errSecItemNotFound { return call.resolve(["value": NSNull()]) }
            guard status == errSecSuccess, let data = out as? Data, let value = String(data: data, encoding: .utf8) else {
                return call.reject("unreadable")
            }
            call.resolve(["value": value])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        fromShell(call) { name in
            guard let value = call.getString("value"), !value.isEmpty, value.count <= Self.maxValueChars,
                let access = Self.accessibility[name]
            else { return call.reject("bad value") }
            SecItemDelete(self.query(name) as CFDictionary)
            var q = self.query(name)
            q[kSecValueData as String] = Data(value.utf8)
            q[kSecAttrAccessible as String] = access
            let status = SecItemAdd(q as CFDictionary, nil)
            status == errSecSuccess ? call.resolve() : call.reject("not saved")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        fromShell(call) { name in
            let status = SecItemDelete(self.query(name) as CFDictionary)
            status == errSecSuccess || status == errSecItemNotFound ? call.resolve() : call.reject("not removed")
        }
    }
}
