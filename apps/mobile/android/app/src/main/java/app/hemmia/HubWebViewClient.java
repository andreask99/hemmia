package app.hemmia;

import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** In hub mode: when the hub's page itself cannot load, go back to the shell's offline screen. */
class HubWebViewClient extends BridgeWebViewClient {

    private final MainActivity activity;

    HubWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame()) activity.showShell("offline");
    }
}
