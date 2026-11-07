package app.hemmia;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Logger;
import com.getcapacitor.util.HostMask;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native checks for opening a hub (SECURITY.md §7). The saved hub list lives in the
 * Preferences plugin's store, which hub pages can also write, so a host must both be saved
 * and match the build's hub host patterns (capacitor.config.ts plugins.HubLauncher.hubHosts).
 */
final class HubHosts {

    private HubHosts() {}

    private static final Pattern HOST = Pattern.compile("^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$");
    /** The hub paths the shell opens: the start page, join links, phone import, push taps. */
    private static final Pattern PATH = Pattern.compile("^/(join|import|push-open)?(#[A-Za-z0-9~_-]{1,200})?$");

    private static final Pattern REF = Pattern.compile("^[A-Za-z0-9_-]{1,200}$");

    static boolean isValidRef(String ref) {
        return REF.matcher(ref).matches();
    }

    static boolean isValidPath(String path) {
        return PATH.matcher(path).matches();
    }

    static boolean isAllowed(Context context, String hubHost) {
        if (!HOST.matcher(hubHost).matches()) return false;
        String name = hubHost.contains(":") ? hubHost.substring(0, hubHost.indexOf(':')) : hubHost;
        String[] allowed = CapConfig.loadDefault(context).getPluginConfiguration("HubLauncher").getArray("hubHosts");
        if (allowed == null || !HostMask.Parser.parse(allowed).matches(name)) return false;
        return isSaved(context, hubHost);
    }

    private static boolean isSaved(Context context, String hubHost) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String json = prefs.getString("hubs.v1", null);
        if (json == null) return false;
        try {
            JSONArray hubs = new JSONArray(json);
            for (int i = 0; i < hubs.length(); i++) {
                JSONObject hub = hubs.optJSONObject(i);
                if (hub != null && hubHost.equals(hub.optString("hubHost"))) return true;
            }
        } catch (Exception e) {
            Logger.warn("HubLauncher", "saved hubs unreadable");
        }
        return false;
    }

    /**
     * The app's full config with only server.url replaced. CapConfig reads it from a file, so
     * it is written to the app's no-backup directory and removed right after (the URL can hold a
     * link code).
     */
    static CapConfig configWithServerUrl(Context context, String url) {
        File dir = new File(context.getNoBackupFilesDir(), "hubconfig");
        File file = new File(dir, "capacitor.config.json");
        try (InputStream in = context.getAssets().open("capacitor.config.json")) {
            JSONObject json = new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
            JSONObject server = json.optJSONObject("server");
            if (server == null) server = new JSONObject();
            server.put("url", url);
            server.remove("errorPath");
            server.remove("allowNavigation");
            json.put("server", server);
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(context, dir.getAbsolutePath());
        } catch (Exception e) {
            Logger.error("HubLauncher", "hub config failed", null);
            return null;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }
}
