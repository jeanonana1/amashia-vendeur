package cm.amashia.seller;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Alertes Firebase du vendeur : Amashia envoie un message à chaque nouvelle commande de sa boutique.
 * Le téléphone sonne et vibre, même application fermée et écran verrouillé ; toucher la notification ouvre les commandes.
 */
public class SellerMessagingService extends FirebaseMessagingService {
    static final String CH_ORDERS = "boutique-commandes";
    static final String PREFS = "amashia-seller";

    @Override
    public void onNewToken(String token) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("fcm", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        // application ouverte à l'écran : le tableau de bord sonne et vibre lui-même
        if (MainActivity.inForeground) return;
        ensureChannel(this);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        String id = d.containsKey("order_id") ? d.get("order_id") : String.valueOf(System.currentTimeMillis());
        String title = d.containsKey("title") ? d.get("title") : "🔔 Nouvelle commande — Amashia";
        String body = d.containsKey("body") ? d.get("body") : "Ouvrez vos commandes pour la préparer.";
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_ORDERS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setSound(sound(this)).setVibrate(PATTERN);
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "amashia:commande");
            wl.acquire(6000);
        } catch (Exception ignored) {}
        nm.notify(id.hashCode(), b.build());
    }

    static final long[] PATTERN = { 0, 450, 250, 450, 250, 450, 250, 450, 250, 450, 250, 900 };

    static Uri sound(Context c) { return Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.prime_chime); }

    /** Canal « Nouvelles commandes » : sonnerie + vibration jouées par Android lui-même. */
    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH_ORDERS) != null) return;
        NotificationChannel ch = new NotificationChannel(CH_ORDERS, "Nouvelles commandes", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Nouvelle commande dans votre boutique : sonnerie et vibration");
        ch.setSound(sound(c), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(PATTERN);
        ch.enableLights(true);
        ch.setLightColor(0xFFFF6800);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
