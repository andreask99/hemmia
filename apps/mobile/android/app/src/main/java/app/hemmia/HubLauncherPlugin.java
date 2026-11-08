package app.hemmia;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import android.util.Base64;

/**
 * open(): shell only, starts a saved hub. showShell(): returns to the shell (the hub's
 * "Switch hub"). launchInfo(): shell only, why the shell was shown. On Android the bridge
 * exists only on the app origin, so calls come from the shell or the current hub.
 */
@CapacitorPlugin(name = "HubLauncher")
public class HubLauncherPlugin extends Plugin {

    /**
     * "Move to a home hub" (PHONE-MODE.md §8, SECURITY.md §7.1): the shell stages its export for
     * one hub; that hub's page takes it once with the token, within 5 minutes. Kept in memory
     * only, across the activity restart into hub mode.
     */
    private static final class StagedExport {
        final String hubHost;
        final String token;
        final String json;
        final long expiresAt;

        StagedExport(String hubHost, String token, String json, long expiresAt) {
            this.hubHost = hubHost;
            this.token = token;
            this.json = json;
            this.expiresAt = expiresAt;
        }
    }

    private static StagedExport staged;
    private static final long EXPORT_TTL_MS = 5 * 60_000;
    private static final int MAX_EXPORT_CHARS = 150 * 1024 * 1024;

    private MainActivity main() {
        return (MainActivity) getActivity();
    }

    @PluginMethod
    public void open(PluginCall call) {
        if (main().hubHost != null || !SecureStorePlugin.callerIsShell(this)) {
            call.reject("not allowed");
            return;
        }
        String host = call.getString("hubHost");
        String path = call.getString("path", "/");
        if (host == null || path == null || !HubHosts.isValidPath(path) || !HubHosts.isAllowed(getContext(), host)) {
            call.reject("not a saved hub");
            return;
        }
        call.resolve();
        main().openHub(host, path);
    }

    @PluginMethod
    public void showShell(PluginCall call) {
        JSObject push = call.getObject("push");
        String hub = push == null ? null : push.getString("hubHost");
        String ref = push == null ? null : push.getString("ref");
        if (hub != null && ref != null && HubHosts.isValidRef(ref) && HubHosts.isAllowed(getContext(), hub)) {
            call.resolve();
            main().showShell("push", hub, ref);
            return;
        }
        call.resolve();
        main().showShell("switch");
    }

    @PluginMethod
    public void stagePhoneExport(PluginCall call) {
        if (main().hubHost != null || !SecureStorePlugin.callerIsShell(this)) {
            call.reject("not allowed");
            return;
        }
        String host = call.getString("hubHost");
        String json = call.getString("json");
        if (host == null || json == null || json.length() > MAX_EXPORT_CHARS || !HubHosts.isAllowed(getContext(), host)) {
            call.reject("bad export");
            return;
        }
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String token = Base64.encodeToString(raw, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        staged = new StagedExport(host, token, json, System.currentTimeMillis() + EXPORT_TTL_MS);
        JSObject result = new JSObject();
        result.put("token", token);
        call.resolve(result);
    }

    @PluginMethod
    public void takePhoneExport(PluginCall call) {
        StagedExport s = staged;
        String token = call.getString("token");
        boolean ok =
            s != null &&
            token != null &&
            s.hubHost.equals(main().hubHost) &&
            System.currentTimeMillis() < s.expiresAt &&
            MessageDigest.isEqual(s.token.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            call.reject("not allowed");
            return;
        }
        staged = null;
        JSObject result = new JSObject();
        result.put("json", s.json);
        call.resolve(result);
    }

    @PluginMethod
    public void setSensitive(PluginCall call) {
        main().setSensitive(Boolean.TRUE.equals(call.getBoolean("on", false)));
        call.resolve();
    }

    @PluginMethod
    public void launchInfo(PluginCall call) {
        if (main().hubHost != null || !SecureStorePlugin.callerIsShell(this)) {
            call.reject("not allowed");
            return;
        }
        JSObject info = new JSObject();
        String reason = main().getIntent().getStringExtra(MainActivity.EXTRA_REASON);
        info.put("reason", reason == null ? "start" : reason);
        String previous = main().getIntent().getStringExtra(MainActivity.EXTRA_HUB_HOST + ".previous");
        info.put("hubHost", previous == null ? JSObject.NULL : previous);
        String link = main().getIntent().getStringExtra(MainActivity.EXTRA_LINK);
        info.put("link", link == null ? JSObject.NULL : link);
        main().getIntent().removeExtra(MainActivity.EXTRA_LINK);
        String pushHub = main().getIntent().getStringExtra(MainActivity.EXTRA_PUSH_HUB);
        String pushRef = main().getIntent().getStringExtra(MainActivity.EXTRA_PUSH_REF);
        if (pushHub != null && pushRef != null) {
            JSObject push = new JSObject();
            push.put("hubHost", pushHub);
            push.put("ref", pushRef);
            info.put("push", push);
            main().getIntent().removeExtra(MainActivity.EXTRA_PUSH_REF);
        } else {
            info.put("push", JSObject.NULL);
        }
        call.resolve(info);
    }
}
