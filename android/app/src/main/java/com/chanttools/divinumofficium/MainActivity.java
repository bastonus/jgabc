package com.chanttools.divinumofficium;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerAppIconInterface();
    }

    @Override
    public void onStart() {
        super.onStart();
        registerAppIconInterface();
    }

    private void registerAppIconInterface() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AppIconInterface(), "AndroidAppIcon");
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
                        // true = Dark text/icons (for Light theme), false = White text/icons (for Dark/OLED theme)
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
}
