package world.indigen.mobile

import android.content.Context
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.gms.ads.nativead.AdChoicesView
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.plugins.googlemobileads.NativeAdFactory

/**
 * The post_comments native layout: an advert drawn in the shape of a reply.
 *
 * Avatar (the advertiser's icon), the advertiser's name with a persistent
 * "Sponsored" tag and the AdChoices mark, the headline and body, the media,
 * then the call to action. Every asset the SDK supplies is registered on its
 * own view so clicks and impressions are attributed by Google, not by us.
 *
 * MediaView stays at least 120dp tall, as AdMob requires for video. Colours
 * arrive from Flutter (customOptions) so the row matches the app's theme; the
 * row reports its measured height back so large system text grows the slot
 * instead of clipping it.
 */
class CommentNativeAdFactory(
    private val context: Context,
    private val onHeight: (String, Double) -> Unit,
) : NativeAdFactory {
    override fun createNativeAd(ad: NativeAd, customOptions: MutableMap<String, Any>?): NativeAdView {
        val density = context.resources.displayMetrics.density
        fun dp(n: Number) = (n.toFloat() * density).toInt()
        fun colour(key: String, fallback: Int): Int = (customOptions?.get(key) as? Number)?.toLong()?.toInt() ?: fallback
        val dark = customOptions?.get("dark") == true
        val ink = colour("ink", if (dark) Color.WHITE else Color.rgb(15, 24, 48))
        val muted = colour("muted", if (dark) Color.rgb(170, 180, 200) else Color.rgb(90, 100, 120))
        val accent = colour("accent", Color.rgb(37, 99, 235))
        val accentSoft = colour("accentSoft", Color.argb(30, 37, 99, 235))
        val border = colour("border", Color.argb(40, 120, 130, 150))
        val avatar = (customOptions?.get("avatar") as? Number)?.toInt() ?: 34

        val view = NativeAdView(context)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(10), 0, dp(12))
        }

        val icon = ImageView(context).apply {
            setImageDrawable(ad.icon?.drawable)
            scaleType = ImageView.ScaleType.CENTER_CROP
            contentDescription = ad.advertiser ?: ad.headline ?: "Advertiser"
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(accentSoft)
                setStroke(dp(1), border)
            }
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, outline: Outline) = outline.setOval(0, 0, v.width, v.height)
            }
            clipToOutline = true
            visibility = if (ad.icon == null) View.INVISIBLE else View.VISIBLE
        }
        root.addView(icon, LinearLayout.LayoutParams(dp(avatar), dp(avatar)).apply { rightMargin = dp(10) })

        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

        // Identity line: name · Sponsored ··· AdChoices
        val identity = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val hasAdvertiser = !ad.advertiser.isNullOrBlank()
        val name = TextView(context).apply {
            text = if (hasAdvertiser) ad.advertiser else ad.headline
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ink)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        // Capped so a long advertiser name cannot push the tag off the row.
        name.maxWidth = dp(190)
        identity.addView(name, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        val tag = TextView(context).apply {
            text = "Sponsored"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ink)
            setPadding(dp(6), dp(2), dp(6), dp(2))
            background = GradientDrawable().apply {
                cornerRadius = dp(5).toFloat()
                setColor(Color.argb(if (dark) 56 else 46, 214, 168, 60))
            }
        }
        identity.addView(tag, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(6) })
        identity.addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
        val choices = AdChoicesView(context)
        identity.addView(choices, LinearLayout.LayoutParams(dp(24), dp(24)))
        column.addView(identity)

        val headline = TextView(context).apply {
            text = ad.headline
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ink)
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            setPadding(0, dp(2), 0, 0)
            visibility = if (hasAdvertiser && !ad.headline.isNullOrBlank()) View.VISIBLE else View.GONE
        }
        column.addView(headline)

        val body = TextView(context).apply {
            text = ad.body
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(ink)
            setLineSpacing(0f, 1.15f)
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
            setPadding(0, dp(2), 0, 0)
            visibility = if (ad.body.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        column.addView(body)

        val media = MediaView(context).apply {
            setImageScaleType(ImageView.ScaleType.CENTER_CROP)
            mediaContent = ad.mediaContent
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, outline: Outline) =
                    outline.setRoundRect(0, 0, v.width, v.height, dp(12).toFloat())
            }
            clipToOutline = true
        }
        column.addView(media, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(132)).apply { topMargin = dp(8) })

        // Store and price where the advertiser supplied them, then the button.
        val footer = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, 0)
        }
        val detail = TextView(context).apply {
            text = listOfNotNull(ad.store, ad.price).filter { it.isNotBlank() }.joinToString(" · ")
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTextColor(muted)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        footer.addView(detail, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val cta = Button(context).apply {
            text = ad.callToAction
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(accent)
            minHeight = dp(40)
            minimumHeight = dp(40)
            setPadding(dp(16), 0, dp(16), 0)
            stateListAnimator = null
            background = GradientDrawable().apply {
                cornerRadius = dp(20).toFloat()
                setColor(accentSoft)
            }
            visibility = if (ad.callToAction.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        footer.addView(cta, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(40)))
        footer.visibility = if (detail.text.isNullOrBlank() && cta.visibility == View.GONE) View.GONE else View.VISIBLE
        column.addView(footer)

        root.addView(column, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        view.addView(root, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))

        var reportedHeight = 0
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            if (root.width > 0) {
                root.measure(
                    View.MeasureSpec.makeMeasureSpec(root.width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                )
                if (root.measuredHeight != reportedHeight) {
                    reportedHeight = root.measuredHeight
                    onHeight(customOptions?.get("instanceId") as? String ?: "", reportedHeight / density.toDouble())
                }
            }
        }

        view.iconView = icon
        if (hasAdvertiser) {
            view.advertiserView = name
            view.headlineView = headline
        } else {
            view.headlineView = name
        }
        view.bodyView = body
        view.mediaView = media
        view.callToActionView = cta
        if (!ad.store.isNullOrBlank()) view.storeView = detail else if (!ad.price.isNullOrBlank()) view.priceView = detail
        view.adChoicesView = choices
        view.setNativeAd(ad)
        return view
    }
}
