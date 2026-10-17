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
 * The Explore native layout: a Google advert on a full black page, the way a
 * full-screen video feed shows one.
 *
 * The media fills the space above the panel (video autoplays muted, as
 * NativeAdOptions asks); under it the advertiser's icon, name and the
 * persistent "Ad" label with AdChoices, the headline and body, and a
 * full-width white call-to-action pill. Every asset is registered on its own
 * view so Google attributes clicks and impressions itself. The advertiser's
 * identity is the SDK's — nothing here relabels it as Indigen World.
 *
 * customOptions: "bottomInset" (dp) keeps the panel clear of Explore's own
 * navigation bar, "topInset" (dp) clears its header.
 */
class ExploreNativeAdFactory(private val context: Context) : NativeAdFactory {
    override fun createNativeAd(ad: NativeAd, customOptions: MutableMap<String, Any>?): NativeAdView {
        val density = context.resources.displayMetrics.density
        fun dp(n: Number) = (n.toFloat() * density).toInt()
        val topInset = (customOptions?.get("topInset") as? Number)?.toInt() ?: 0
        val bottomInset = (customOptions?.get("bottomInset") as? Number)?.toInt() ?: 0
        val grey = Color.rgb(169, 177, 190)

        val view = NativeAdView(context).apply { setBackgroundColor(Color.BLACK) }
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(topInset), 0, dp(bottomInset + 12))
        }

        val media = MediaView(context).apply {
            setImageScaleType(ImageView.ScaleType.FIT_CENTER)
            mediaContent = ad.mediaContent
            setBackgroundColor(Color.BLACK)
        }
        root.addView(media, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

        val identity = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(14), dp(18), 0)
        }
        val icon = ImageView(context).apply {
            setImageDrawable(ad.icon?.drawable)
            scaleType = ImageView.ScaleType.CENTER_CROP
            contentDescription = ad.advertiser ?: ad.headline ?: "Advertiser"
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.rgb(27, 35, 51))
            }
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, outline: Outline) =
                    outline.setRoundRect(0, 0, v.width, v.height, dp(10).toFloat())
            }
            clipToOutline = true
            visibility = if (ad.icon == null) View.GONE else View.VISIBLE
        }
        identity.addView(icon, LinearLayout.LayoutParams(dp(48), dp(48)).apply { rightMargin = dp(12) })

        val names = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val hasAdvertiser = !ad.advertiser.isNullOrBlank()
        val name = TextView(context).apply {
            text = if (hasAdvertiser) ad.advertiser else ad.headline
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        names.addView(name)
        val store = TextView(context).apply {
            text = listOfNotNull(ad.store, ad.price).filter { it.isNotBlank() }.joinToString(" · ")
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(grey)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            visibility = if (text.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        names.addView(store)
        identity.addView(names, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        identity.addView(TextView(context).apply {
            text = "Ad"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(grey)
            setPadding(dp(8), 0, dp(4), 0)
        })
        val choices = AdChoicesView(context)
        identity.addView(choices, LinearLayout.LayoutParams(dp(24), dp(24)))
        root.addView(identity)

        val headline = TextView(context).apply {
            text = ad.headline
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
            setPadding(dp(18), dp(12), dp(18), 0)
            visibility = if (hasAdvertiser && !ad.headline.isNullOrBlank()) View.VISIBLE else View.GONE
        }
        root.addView(headline)
        val body = TextView(context).apply {
            text = ad.body
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTextColor(Color.WHITE)
            setLineSpacing(0f, 1.15f)
            maxLines = 4
            ellipsize = TextUtils.TruncateAt.END
            setPadding(dp(18), dp(if (headline.visibility == View.VISIBLE) 2 else 12), dp(18), 0)
            visibility = if (ad.body.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        root.addView(body)

        val cta = Button(context).apply {
            text = ad.callToAction
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.BLACK)
            stateListAnimator = null
            background = GradientDrawable().apply {
                cornerRadius = dp(25).toFloat()
                setColor(Color.WHITE)
            }
            visibility = if (ad.callToAction.isNullOrBlank()) View.GONE else View.VISIBLE
        }
        root.addView(cta, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(50)).apply {
            setMargins(dp(18), dp(16), dp(18), 0)
        })

        view.addView(root, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        view.mediaView = media
        view.iconView = icon
        if (hasAdvertiser) {
            view.advertiserView = name
            view.headlineView = headline
        } else {
            view.headlineView = name
        }
        view.bodyView = body
        view.callToActionView = cta
        if (!ad.store.isNullOrBlank()) view.storeView = store else if (!ad.price.isNullOrBlank()) view.priceView = store
        view.adChoicesView = choices
        view.setNativeAd(ad)
        return view
    }
}
