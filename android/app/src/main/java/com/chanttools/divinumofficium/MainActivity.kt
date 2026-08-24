package com.chanttools.divinumofficium

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set status and navigation bar styling
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.parseColor("#121214")
        window.navigationBarColor = Color.parseColor("#121214")

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        setupWebView()
        setupBackNavigation()

        // Load Divinum Officium via local asset loader
        webView.loadUrl("https://appassets.androidplatform.net/assets/divinum-officium.html")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/res/", WebViewAssetLoader.ResourcesPathHandler(this))
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            textZoom = 100
        }

        webView.setBackgroundColor(Color.parseColor("#121214"))

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.let { assetLoader.shouldInterceptRequest(it) }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                // Handle external links (like GitHub, GregoBase) in external browser
                if (url.startsWith("https://github.com") || 
                    url.startsWith("https://gregobase.selapa.net") || 
                    (!url.startsWith("https://appassets.androidplatform.net") && !url.startsWith("file:///android_asset"))) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                return super.onConsoleMessage(consoleMessage)
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // If sidebar, settings drawer or header dropdown are open in JS, close them smoothly
                webView.evaluateJavascript(
                    """
                    (function() {
                        var sidebar = document.getElementById('doSidebar');
                        var backdrop = document.getElementById('sidebarBackdrop');
                        var settings = document.getElementById('settingsPanel');
                        var sBackdrop = document.getElementById('settingsBackdrop');
                        var dropdown = document.getElementById('headerDropdown');
                        
                        if (settings && settings.classList.contains('open')) {
                            settings.classList.remove('open');
                            if (sBackdrop) sBackdrop.classList.remove('open');
                            return 'handled';
                        }
                        if (sidebar && sidebar.classList.contains('open')) {
                            sidebar.classList.remove('open');
                            if (backdrop) backdrop.classList.remove('open');
                            return 'handled';
                        }
                        if (dropdown && !dropdown.classList.contains('hidden')) {
                            dropdown.classList.add('hidden');
                            return 'handled';
                        }
                        return 'none';
                    })();
                    """.trimIndent()
                ) { result ->
                    val cleanResult = result?.replace("\"", "") ?: "none"
                    if (cleanResult != "handled") {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        }
                    }
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
