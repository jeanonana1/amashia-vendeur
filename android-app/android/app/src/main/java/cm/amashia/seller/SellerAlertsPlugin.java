package cm.amashia.seller;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Pont avec le tableau de bord : jeton Firebase du téléphone (alertes de commandes) et autorisation des notifications. */
@CapacitorPlugin(name = "SellerAlerts")
public class SellerAlertsPlugin extends Plugin {
    @PluginMethod
    public void pushToken(PluginCall call) {
        SellerMessagingService.ensureChannel(getContext());
        // Android 13+ : autorisation d'afficher les notifications
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7701);
        }
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                if (t.isSuccessful() && t.getResult() != null) { JSObject r = new JSObject(); r.put("token", t.getResult()); call.resolve(r); }
                else call.reject("Firebase indisponible : " + (t.getException() != null ? t.getException().getMessage() : "inconnu"));
            });
        } catch (Exception e) { call.reject("Firebase indisponible : " + e.getMessage()); }
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createWaveform(SellerMessagingService.PATTERN, -1));
                else v.vibrate(SellerMessagingService.PATTERN, -1);
            }
        } catch (Exception ignored) {}
        call.resolve();
    }
}
