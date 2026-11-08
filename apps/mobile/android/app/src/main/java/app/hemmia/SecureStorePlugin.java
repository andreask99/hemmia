package app.hemmia;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * API keys and the phone-mode data key (PHONE-MODE.md §5). Each value is encrypted with a
 * non-exportable AES-256-GCM key in the Android Keystore (the value's name is the AAD) and kept
 * in app-private SharedPreferences; the app has allowBackup="false". Only the bundled shell may
 * call this: hub pages share the bridge (spike P5.1) and must never read a key.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String KEY_ALIAS = "kchat.securestore.v1";
    private static final String PREFS = "kchat.securestore";
    private static final List<String> NAMES = Arrays.asList("apiKey.anthropic", "apiKey.openai", "dataKey");
    private static final int IV_BYTES = 12;
    private static final int MAX_VALUE_CHARS = 4096;

    /**
     * True when the page in the web view is the bundled shell (the bridge's local URL), as on iOS
     * (SECURITY.md §7). The demo (/demo/, the hub's web app with a made-up family) is bundled too
     * but is not the shell: it never gets keys or hub launching (security review 2026-11-08).
     * The URL can only be read on the UI thread; runOnUiThread runs at once when the call is
     * already there. Also used by HubLauncherPlugin.
     */
    static boolean callerIsShell(Plugin plugin) {
        final String[] current = { null };
        final CountDownLatch read = new CountDownLatch(1);
        plugin.getActivity().runOnUiThread(() -> {
            if (plugin.getBridge() != null && plugin.getBridge().getWebView() != null) {
                current[0] = plugin.getBridge().getWebView().getUrl();
            }
            read.countDown();
        });
        try {
            if (!read.await(2, TimeUnit.SECONDS)) return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
        if (current[0] == null || plugin.getBridge() == null) return false;
        Uri page = Uri.parse(current[0]);
        Uri shell = Uri.parse(plugin.getBridge().getLocalUrl());
        String path = page.getPath() == null ? "/" : page.getPath();
        return page.getScheme() != null
            && page.getScheme().equals(shell.getScheme())
            && page.getHost() != null
            && page.getHost().equals(shell.getHost())
            && page.getPort() == shell.getPort()
            && !path.startsWith("/demo/")
            && !path.equals("/demo");
    }

    private boolean refuse(PluginCall call) {
        if (((MainActivity) getActivity()).hubHost != null || !callerIsShell(this)) {
            call.reject("not allowed");
            return true;
        }
        String name = call.getString("name");
        if (name == null || !NAMES.contains(name)) {
            call.reject("unknown name");
            return true;
        }
        return false;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return gen.generateKey();
    }

    @PluginMethod
    public void get(PluginCall call) {
        if (refuse(call)) return;
        String name = call.getString("name");
        String stored = prefs().getString(name, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            ByteBuffer buf = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
            byte[] iv = new byte[IV_BYTES];
            buf.get(iv);
            byte[] ct = new byte[buf.remaining()];
            buf.get(ct);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            c.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            result.put("value", new String(c.doFinal(ct), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) {
            // Never log the value or the exception text (it can contain data).
            Logger.warn("SecureStore", "value unreadable");
            call.reject("unreadable");
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        if (refuse(call)) return;
        String name = call.getString("name");
        String value = call.getString("value");
        if (value == null || value.isEmpty() || value.length() > MAX_VALUE_CHARS) {
            call.reject("bad value");
            return;
        }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            c.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = c.getIV();
            ByteBuffer out = ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct);
            if (!prefs().edit().putString(name, Base64.encodeToString(out.array(), Base64.NO_WRAP)).commit()) {
                call.reject("not saved");
                return;
            }
            call.resolve();
        } catch (Exception e) {
            Logger.warn("SecureStore", "value not saved");
            call.reject("not saved");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        if (refuse(call)) return;
        prefs().edit().remove(call.getString("name")).commit();
        call.resolve();
    }
}
