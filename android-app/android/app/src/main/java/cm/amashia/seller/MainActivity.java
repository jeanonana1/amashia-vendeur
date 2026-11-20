package cm.amashia.seller;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Application visible à l'écran : la sonnerie est alors jouée par le tableau de bord lui-même. */
    public static volatile boolean inForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SellerAlertsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() { super.onResume(); inForeground = true; }

    @Override
    public void onPause() { inForeground = false; super.onPause(); }
}
