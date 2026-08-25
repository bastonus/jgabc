package com.chanttools.divinumofficium;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {

    private static final String[] ALIASES = {
        "MainActivityDefault",
        "MainActivityRed",
        "MainActivityPurple",
        "MainActivityGreen",
        "MainActivityGold",
        "MainActivityBlue",
        "MainActivityRose",
        "MainActivityAmber",
        "MainActivityGrey"
    };

    private File pendingApkFile = null;
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerNativeInterfaces();
    }

    @Override
    public void onStart() {
        super.onStart();
        registerNativeInterfaces();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (pendingApkFile != null && pendingApkFile.exists()) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                File apk = pendingApkFile;
                pendingApkFile = null;
                installApkFile(apk);
            }
        }
    }

    private void registerNativeInterfaces() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView wv = getBridge().getWebView();
                wv.addJavascriptInterface(new AppIconInterface(), "AndroidAppIcon");
                wv.addJavascriptInterface(new AppUpdateInterface(), "AndroidAppUpdate");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public class AppIconInterface {
        @JavascriptInterface
        public void setIcon(String aliasSuffix) {
            runOnUiThread(() -> {
                try {
                    String targetAlias = "MainActivityDefault";
                    if (aliasSuffix != null && !aliasSuffix.trim().isEmpty() && !aliasSuffix.equalsIgnoreCase("default")) {
                        for (String a : ALIASES) {
                            if (a.equalsIgnoreCase("MainActivity" + aliasSuffix.trim())) {
                                targetAlias = a;
                                break;
                            }
                        }
                    }

                    PackageManager pm = getPackageManager();
                    String pkg = getPackageName();

                    // 1. Enable the desired alias first
                    ComponentName targetComponent = new ComponentName(pkg, pkg + "." + targetAlias);
                    pm.setComponentEnabledSetting(
                        targetComponent,
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        PackageManager.DONT_KILL_APP
                    );

                    // 2. Disable all other aliases
                    for (String a : ALIASES) {
                        if (!a.equals(targetAlias)) {
                            ComponentName otherComponent = new ComponentName(pkg, pkg + "." + a);
                            pm.setComponentEnabledSetting(
                                otherComponent,
                                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                                PackageManager.DONT_KILL_APP
                            );
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void setStatusBarTheme(String themeName, String hexColor) {
            runOnUiThread(() -> {
                try {
                    Window window = getWindow();
                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
                    boolean isLight = "light".equalsIgnoreCase(themeName);
                    if (controller != null) {
                        controller.setAppearanceLightStatusBars(isLight);
                        controller.setAppearanceLightNavigationBars(isLight);
                    }
                    if (hexColor != null && !hexColor.trim().isEmpty()) {
                        int parsedColor = Color.parseColor(hexColor.trim());
                        window.setStatusBarColor(parsedColor);
                        window.setNavigationBarColor(parsedColor);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }

    public class AppUpdateInterface {
        @JavascriptInterface
        public boolean isSupported() {
            return true;
        }

        @JavascriptInterface
        public void downloadAndInstallApk(String apkUrl, String versionTag) {
            if (apkUrl == null || apkUrl.trim().isEmpty()) {
                notifyJsError("URL de téléchargement invalide");
                return;
            }

            downloadExecutor.execute(() -> {
                HttpURLConnection conn = null;
                InputStream in = null;
                FileOutputStream out = null;
                try {
                    notifyJsProgress(5);
                    conn = openConnectionWithRedirects(apkUrl.trim());
                    int responseCode = conn.getResponseCode();
                    if (responseCode != HttpURLConnection.HTTP_OK) {
                        notifyJsError("Erreur HTTP " + responseCode + " lors du téléchargement");
                        return;
                    }

                    long totalBytes = conn.getContentLength();
                    File destDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (destDir == null) {
                        destDir = getCacheDir();
                    }
                    File apkFile = new File(destDir, "oremus-update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }

                    in = conn.getInputStream();
                    out = new FileOutputStream(apkFile);

                    byte[] buffer = new byte[8192];
                    long downloaded = 0;
                    int read;
                    long lastNotifyTime = System.currentTimeMillis();

                    while ((read = in.read(buffer)) != -1) {
                        out.write(buffer, 0, read);
                        downloaded += read;
                        if (totalBytes > 0) {
                            int percent = (int) Math.min(99, (downloaded * 100) / totalBytes);
                            long now = System.currentTimeMillis();
                            if (now - lastNotifyTime >= 150) {
                                lastNotifyTime = now;
                                notifyJsProgress(percent);
                            }
                        }
                    }
                    out.flush();
                    notifyJsProgress(100);

                    // Proceed to install
                    runOnUiThread(() -> checkAndInstall(apkFile));

                } catch (Exception e) {
                    e.printStackTrace();
                    notifyJsError("Échec du téléchargement : " + e.getMessage());
                } finally {
                    try { if (out != null) out.close(); } catch (Exception ignored) {}
                    try { if (in != null) in.close(); } catch (Exception ignored) {}
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
                }
            });
        }
    }

    private HttpURLConnection openConnectionWithRedirects(String initialUrl) throws Exception {
        String currentUrl = initialUrl;
        HttpURLConnection conn = null;
        int redirects = 0;
        while (redirects < 6) {
            URL url = new URL(currentUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile) DivinumOfficium");
            conn.setRequestProperty("Accept", "application/octet-stream, */*");
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(40000);
            conn.setInstanceFollowRedirects(false);
            int status = conn.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                status == HttpURLConnection.HTTP_MOVED_PERM ||
                status == HttpURLConnection.HTTP_SEE_OTHER ||
                status == 307 || status == 308) {
                String newUrl = conn.getHeaderField("Location");
                if (newUrl != null && !newUrl.isEmpty()) {
                    currentUrl = newUrl;
                    conn.disconnect();
                    redirects++;
                    continue;
                }
            }
            break;
        }
        return conn;
    }

    private void checkAndInstall(File apkFile) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                pendingApkFile = apkFile;
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                    Toast.makeText(this, "Veuillez autoriser l'installation d'applications pour continuer la mise à jour", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                    startActivity(intent);
                }
                return;
            }
        }
        installApkFile(apkFile);
    }

    private void installApkFile(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) {
                notifyJsError("Fichier APK introuvable");
                return;
            }

            Uri apkUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
            notifyJsError("Erreur d'installation : " + e.getMessage());
        }
    }

    private void notifyJsProgress(int percent) {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "if(typeof window.onUpdateDownloadProgress === 'function') window.onUpdateDownloadProgress(" + percent + ");",
                        null
                    );
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private void notifyJsError(String message) {
        runOnUiThread(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    String safeMsg = (message != null) ? message.replace("'", "\\'") : "Erreur inconnue";
                    getBridge().getWebView().evaluateJavascript(
                        "if(typeof window.onUpdateDownloadError === 'function') window.onUpdateDownloadError('" + safeMsg + "');",
                        null
                    );
                }
                Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }
}
