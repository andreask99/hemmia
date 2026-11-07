package app.hemmia;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

/**
 * Runs either the bundled shell or one paired hub (docs/public/ARCHITECTURE.md §3.4). A hub is
 * started as the bridge's server URL, so its pages are the app origin and get every plugin
 * (spike P5.1). Switching between the two restarts the activity.
 */
public class MainActivity extends BridgeActivity {

    static final String EXTRA_HUB_HOST = "hemmia.hubHost";
    static final String EXTRA_HUB_PATH = "hemmia.hubPath";
    static final String EXTRA_REASON = "hemmia.reason";
    static final String EXTRA_LINK = "hemmia.link";
    static final String EXTRA_PUSH_HUB = "hemmia.push.hub";
    static final String EXTRA_PUSH_REF = "hemmia.push.ref";

    /** The hub this activity runs, or null for the shell. */
    String hubHost;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(HubLauncherPlugin.class);
        registerPlugin(SecureStorePlugin.class);
        createNotificationChannel();
        Intent intent = getIntent();
        String host = intent.getStringExtra(EXTRA_HUB_HOST);
        String path = intent.getStringExtra(EXTRA_HUB_PATH);
        if (host != null && path != null && HubHosts.isAllowed(this, host) && HubHosts.isValidPath(path)) {
            config = HubHosts.configWithServerUrl(this, "https://" + host + path);
            if (config != null) hubHost = host;
        }
        // Never leave a link code in the intent the system keeps for this task.
        intent.removeExtra(EXTRA_HUB_PATH);
        super.onCreate(savedInstanceState);
        if (hubHost != null && bridge != null) bridge.setWebViewClient(new HubWebViewClient(bridge, this));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // A join link while a hub runs goes to the shell, never to the hub's page.
        if (hubHost != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            Intent next = new Intent(this, MainActivity.class)
                .putExtra(EXTRA_REASON, "link")
                .putExtra(EXTRA_LINK, intent.getData().toString())
                .putExtra(EXTRA_HUB_HOST + ".previous", hubHost);
            relaunch(next);
            return;
        }
        super.onNewIntent(intent);
    }

    /** Restarts with the hub as server URL. Callers check the host and path first. */
    void openHub(String host, String path) {
        relaunch(new Intent(this, MainActivity.class).putExtra(EXTRA_HUB_HOST, host).putExtra(EXTRA_HUB_PATH, path));
    }

    /** Restarts with the bundled shell; the shell reads the reason through HubLauncher.launchInfo(). */
    void showShell(String reason) {
        showShell(reason, null, null);
    }

    /** With a tapped notification for another hub, which the shell then opens. */
    void showShell(String reason, String pushHub, String pushRef) {
        Intent next = new Intent(this, MainActivity.class).putExtra(EXTRA_REASON, reason);
        if (hubHost != null) next.putExtra(EXTRA_HUB_HOST + ".previous", hubHost);
        if (pushHub != null && pushRef != null) next.putExtra(EXTRA_PUSH_HUB, pushHub).putExtra(EXTRA_PUSH_REF, pushRef);
        relaunch(next);
    }

    /** Screens with a recovery code or a sign-in QR: no screenshots, blank in recents (P5.6). */
    void setSensitive(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }

    /** The channel named in the relay's FCM messages (RELAY.md: channel_id "replies"). */
    private void createNotificationChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.createNotificationChannel(
            new NotificationChannel("replies", getString(R.string.channel_replies), NotificationManager.IMPORTANCE_HIGH)
        );
    }

    private void relaunch(Intent next) {
        runOnUiThread(() -> {
            next.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(next);
            finish();
            overridePendingTransition(0, 0);
        });
    }
}
