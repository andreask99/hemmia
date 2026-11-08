package app.hemmia;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.Bridge;
import com.getcapacitor.Logger;
import com.getcapacitor.MessageHandler;
import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * In hub mode, hub pages reach only the plugins they use (apps/web/src/native/bridge.ts);
 * Filesystem, Preferences, WebView, CapacitorHttp, SecureStore, App, Share and Cordova calls are
 * dropped (security review 2026-11-07, H2). Replaces Capacitor's "androidBridge" channel with a
 * filtering one; if that is not possible, hub pages get no plugins at all (fails closed).
 */
final class HubPluginFilter {

    static final Set<String> ALLOWED = new HashSet<>(
        Arrays.asList("HubLauncher", "PushNotifications", "CapacitorBarcodeScanner", "Console")
    );
    private static final String NAME = "androidBridge";

    private HubPluginFilter() {}

    static boolean allowed(String json) {
        try {
            JSONObject o = new JSONObject(json);
            String type = o.optString("type", "");
            return type.equals("js.error") || (type.equals("message") && ALLOWED.contains(o.optString("pluginId", "")));
        } catch (Exception e) {
            return false;
        }
    }

    static void install(Bridge bridge) {
        WebView webView = bridge.getWebView();
        MessageHandler handler = null;
        try {
            Field f = Bridge.class.getDeclaredField("msgHandler");
            f.setAccessible(true);
            handler = (MessageHandler) f.get(bridge);
        } catch (Exception e) {
            Logger.error("hub plugin filter: no message handler, plugins off");
        }
        final MessageHandler target = handler;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(webView, NAME);
        }
        webView.removeJavascriptInterface(NAME);
        if (target == null) return;
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView,
                NAME,
                bridge.getAllowedOriginRules(),
                (view, message, origin, isMainFrame, reply) -> {
                    String data = message.getData();
                    if (isMainFrame && data != null && allowed(data)) target.postMessage(data);
                }
            );
        } else {
            webView.addJavascriptInterface(
                new Object() {
                    @JavascriptInterface
                    public void postMessage(String data) {
                        if (data != null && allowed(data)) target.postMessage(data);
                    }
                },
                NAME
            );
        }
    }
}
