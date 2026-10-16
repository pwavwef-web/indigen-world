package world.indigen.mobile

import android.content.Context
import android.graphics.Color
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.FrameLayout
import com.google.android.gms.ads.nativead.AdChoicesView
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.plugins.googlemobileads.NativeAdFactory

/** A real registered native layout. MediaView stays >=120dp for video. */
class CommentNativeAdFactory(private val context: Context, private val onHeight: (String, Double) -> Unit) : NativeAdFactory {
    override fun createNativeAd(ad: NativeAd, customOptions: MutableMap<String, Any>?): NativeAdView {
        val density = context.resources.displayMetrics.density
        fun dp(n: Int) = (n * density).toInt()
        val dark = customOptions?.get("dark") == true
        val ink = if (dark) Color.WHITE else Color.rgb(15, 24, 48)
        val view = NativeAdView(context)
        val root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), dp(8), dp(12), dp(8)); setBackgroundColor(if (dark) Color.rgb(23, 34, 57) else Color.WHITE) }
        val identity = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val icon = ImageView(context).apply { setImageDrawable(ad.icon?.drawable); contentDescription = ad.advertiser ?: "Advertiser" }
        identity.addView(icon, LinearLayout.LayoutParams(dp(32), dp(32)))
        val heading = TextView(context).apply { text = ad.advertiser ?: ad.headline; textSize = 14f; setTextColor(ink); setPadding(dp(8), 0, 0, 0) }
        identity.addView(heading, LinearLayout.LayoutParams(0, -2, 1f))
        identity.addView(TextView(context).apply { text = "Ad"; textSize = 12f; setTextColor(ink) })
        val choices = AdChoicesView(context); identity.addView(choices, LinearLayout.LayoutParams(dp(24), dp(24)))
        root.addView(identity)
        val row = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(8), 0, 0) }
        val text = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, dp(10), 0) }
        val headline = TextView(context).apply { this.text = ad.headline; textSize = 15f; setTextColor(ink) }
        val body = TextView(context).apply { this.text = ad.body; textSize = 13f; setTextColor(ink); visibility = if (ad.body == null) View.GONE else View.VISIBLE }
        val cta = Button(context).apply { this.text = ad.callToAction; textSize = 13f; minHeight = dp(48); visibility = if (ad.callToAction == null) View.GONE else View.VISIBLE }
        text.addView(headline); text.addView(body); text.addView(cta); row.addView(text, LinearLayout.LayoutParams(0, -2, 1f))
        val media = MediaView(context); media.mediaContent = ad.mediaContent; row.addView(media, LinearLayout.LayoutParams(dp(120), dp(120)))
        root.addView(row); view.addView(root, FrameLayout.LayoutParams(-1, -2))
        var reportedHeight = 0
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            if (root.width > 0) {
                root.measure(View.MeasureSpec.makeMeasureSpec(root.width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
                if (root.measuredHeight != reportedHeight) {
                    reportedHeight = root.measuredHeight
                    onHeight(customOptions?.get("instanceId") as? String ?: "", reportedHeight / density.toDouble())
                }
            }
        }
        view.headlineView = headline; view.bodyView = body; view.callToActionView = cta; view.iconView = icon; view.advertiserView = heading; view.mediaView = media; view.adChoicesView = choices
        view.setNativeAd(ad)
        return view
    }
}
