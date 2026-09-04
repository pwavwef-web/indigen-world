import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/collection/apps_and_shop.dart';
import 'package:indigen_world_mobile/features/collection/apps_screen.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';

/// Collection → Shop: Kassena souvenirs, books, shea butter and craft.
///
/// The shop takes no payment. A member picks what they want and sends a
/// request; somebody from the project answers on the contact they left and
/// arranges payment and delivery. That is stated on the screen rather than
/// implied, because a basket button that does not charge you is otherwise a
/// small betrayal.
class ShopCollectionScreen extends ConsumerStatefulWidget {
  const ShopCollectionScreen({super.key});

  @override
  ConsumerState<ShopCollectionScreen> createState() =>
      _ShopCollectionScreenState();
}

class _ShopCollectionScreenState extends ConsumerState<ShopCollectionScreen> {
  /// Product id → line. Kept on the screen rather than in a provider: a basket
  /// that outlives the screen it was filled on would quietly resubmit itself.
  final _basket = <String, ShopOrderLine>{};

  int get _itemCount =>
      _basket.values.fold<int>(0, (total, line) => total + line.quantity);

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(shopProductsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Shop')),
      bottomNavigationBar: _basket.isEmpty
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(18, 8, 18, 14),
              child: FilledButton.icon(
                onPressed: _review,
                icon: const Icon(Icons.shopping_basket_outlined),
                label: Text(
                  'Review request · $_itemCount '
                  '${_itemCount == 1 ? 'item' : 'items'}',
                ),
              ),
            ),
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(shopProductsProvider);
            await ref.read(shopProductsProvider.future);
          },
          child: CustomScrollView(
            key: const PageStorageKey('collection-shop-scroll'),
            slivers: [
              const SliverToBoxAdapter(
                child: BrandHeader(
                  eyebrow: 'Collection · Shop',
                  title: 'Carry a piece of home.',
                ),
              ),
              ...switch (products) {
                AsyncData(value: final list) when list.isEmpty => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: CataloguePlaceholder(
                      icon: Icons.storefront_outlined,
                      title: 'The shop is being stocked',
                      body:
                          'Nothing is listed yet. Check back soon, or ask in '
                          'the Community tab.',
                    ),
                  ),
                ],
                AsyncData(value: final list) => [
                  _ProductRows(
                    products: list,
                    ads: ref.watch(collectionAdsProvider),
                    quantityOf: (product) =>
                        _basket[product.id]?.quantity ?? 0,
                    onChanged: _setQuantity,
                  ),
                ],
                AsyncError() => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: CataloguePlaceholder(
                      icon: Icons.cloud_off_rounded,
                      title: 'Could not load the shop',
                      body: 'Check your connection and pull down to try again.',
                    ),
                  ),
                ],
                _ => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
              },
            ],
          ),
        ),
      ),
    );
  }

  void _setQuantity(ShopProduct product, int quantity) {
    HapticFeedback.selectionClick();
    setState(() {
      if (quantity <= 0) {
        _basket.remove(product.id);
      } else {
        _basket[product.id] = ShopOrderLine(
          product: product,
          quantity: quantity.clamp(1, 20),
        );
      }
    });
  }

  Future<void> _review() async {
    var user = ref.read(firebaseAuthProvider)?.currentUser;
    if (user == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !mounted) return;
      user = ref.read(firebaseAuthProvider)?.currentUser;
    }
    final repository = ref.read(collectionCatalogueRepositoryProvider);
    if (user == null || repository == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Orders are unavailable right now. Check your connection.',
            ),
          ),
        );
      }
      return;
    }

    final lines = _basket.values.toList(growable: false);
    final draft = await showGlassPopup<ShopOrderDraft>(
      context: context,
      title: 'Send your request',
      scrollable: false,
      builder: (_) =>
          _OrderRequestForm(lines: lines, defaultContact: user!.email ?? ''),
    );
    if (draft == null || !mounted) return;

    try {
      await repository.submitOrder(uid: user.uid, draft: draft);
      if (!mounted) return;
      setState(_basket.clear);
      await showGlassPopup<void>(
        context: context,
        title: 'Request sent',
        builder: (popupContext) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.mark_email_read_rounded,
              color: context.brand.success,
              size: 34,
            ),
            const SizedBox(height: 14),
            Text(
              'Somebody from the project will reach you on the contact you '
              'left to confirm the price, payment and delivery.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.ink, height: 1.5),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(popupContext),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } on Object {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('The request was not sent. Please try again.'),
        ),
      );
    }
  }
}

/// The stock, with adverts dealt between the products.
///
/// The basket lives on the screen rather than in a provider, so the quantity
/// arrives as a lookup rather than as a copied map: a row has to read the count
/// that is in the basket *now*, and a snapshot taken when the list was built is
/// the count that was in it a tap ago.
class _ProductRows extends StatelessWidget {
  const _ProductRows({
    required this.products,
    required this.ads,
    required this.quantityOf,
    required this.onChanged,
  });

  final List<ShopProduct> products;
  final List<ServedAd> ads;
  final int Function(ShopProduct product) quantityOf;
  final void Function(ShopProduct product, int quantity) onChanged;

  @override
  Widget build(BuildContext context) {
    final rows = collectionRowsWithAds(items: products, ads: ads);
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 40),
      sliver: SliverList.separated(
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final row = rows[index];
          if (row is ServedAd) {
            return SponsoredCard(
              ad: row,
              slot: 'shop-$index',
              margin: EdgeInsets.zero,
            );
          }
          final product = row as ShopProduct;
          return _ProductCard(
            product: product,
            quantity: quantityOf(product),
            onChanged: (quantity) => onChanged(product, quantity),
          );
        },
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.quantity,
    required this.onChanged,
  });

  final ShopProduct product;
  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => CollectionCardSurface(
    padding: const EdgeInsets.all(15),
    semanticLabel: '${product.name}. ${product.summary}. ${product.priceLabel}',
    onTap: () => _openDetail(context),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ProductImage(url: product.imageUrl),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product.name,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (product.summary.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  product.summary,
                  style: const TextStyle(fontSize: 13, height: 1.4),
                ),
              ],
              if (product.maker.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  product.maker,
                  style: TextStyle(
                    color: context.brand.mutedInk,
                    fontSize: 11.5,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(
                    product.priceLabel,
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: context.brand.accent,
                    ),
                  ),
                  const Spacer(),
                  if (!product.inStock)
                    Text(
                      'OUT OF STOCK',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.6,
                        color: context.brand.terracotta,
                      ),
                    )
                  else
                    _QuantityStepper(quantity: quantity, onChanged: onChanged),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
  );

  void _openDetail(BuildContext context) {
    showGlassPopup<void>(
      context: context,
      title: product.name,
      builder: (_) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (product.category.isNotEmpty) ...[
            CatalogueTag(label: product.category),
            const SizedBox(height: 12),
          ],
          Text(
            product.description.isNotEmpty
                ? product.description
                : product.summary,
            style: const TextStyle(height: 1.55),
          ),
          const SizedBox(height: 14),
          Text(
            product.priceLabel,
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 17,
              color: context.brand.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductImage extends StatelessWidget {
  const _ProductImage({required this.url});

  final String url;

  @override
  Widget build(BuildContext context) {
    final fallback = DecoratedBox(
      decoration: BoxDecoration(
        color: context.brand.surfaceMuted,
        borderRadius: const BorderRadius.all(Radius.circular(15)),
      ),
      child: Icon(
        Icons.local_mall_outlined,
        color: context.brand.mutedInk,
        size: 26,
      ),
    );
    return SizedBox.square(
      dimension: 76,
      child: url.isEmpty
          ? fallback
          : ClipRRect(
              borderRadius: BorderRadius.circular(15),
              child: CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                placeholder: (context, _) => fallback,
                errorWidget: (context, _, _) => fallback,
              ),
            ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.quantity, required this.onChanged});

  final int quantity;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    if (quantity == 0) {
      return OutlinedButton(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 34),
          padding: const EdgeInsets.symmetric(horizontal: 14),
        ),
        onPressed: () => onChanged(1),
        child: const Text('Add'),
      );
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton.filledTonal(
          visualDensity: VisualDensity.compact,
          onPressed: () => onChanged(quantity - 1),
          icon: const Icon(Icons.remove_rounded, size: 17),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 9),
          child: Text(
            '$quantity',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
        IconButton.filledTonal(
          visualDensity: VisualDensity.compact,
          onPressed: quantity >= 20 ? null : () => onChanged(quantity + 1),
          icon: const Icon(Icons.add_rounded, size: 17),
        ),
      ],
    );
  }
}

/// Where the member says how to reach them. The only required field: without
/// it the request cannot be answered, which would make sending it pointless.
class _OrderRequestForm extends StatefulWidget {
  const _OrderRequestForm({required this.lines, required this.defaultContact});

  final List<ShopOrderLine> lines;
  final String defaultContact;

  @override
  State<_OrderRequestForm> createState() => _OrderRequestFormState();
}

class _OrderRequestFormState extends State<_OrderRequestForm> {
  late final _contact = TextEditingController(text: widget.defaultContact);
  final _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _contact.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.lines.fold<int>(
      0,
      (running, line) => running + line.totalMinor,
    );
    final currency = widget.lines.isEmpty
        ? 'GHS'
        : widget.lines.first.product.currency;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final line in widget.lines)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${line.quantity} × ${line.product.name}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(line.product.priceLabel),
              ],
            ),
          ),
        const Divider(height: 22),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Estimated total',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
            Text(
              total <= 0
                  ? 'To be confirmed'
                  : '$currency ${(total / 100).toStringAsFixed(2)}',
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          'Nothing is charged here. The project confirms the final price, '
          'payment and delivery with you.',
          style: TextStyle(color: context.brand.mutedInk, fontSize: 11.5),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _contact,
          decoration: const InputDecoration(
            labelText: 'How should we reach you?',
            hintText: 'Phone, WhatsApp or email',
            prefixIcon: Icon(Icons.contact_phone_outlined),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _note,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Anything else? (optional)',
            hintText: 'Sizes, delivery town, or a question',
            alignLabelWithHint: true,
            prefixIcon: Icon(Icons.notes_rounded),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(
            _error!,
            style: TextStyle(
              color: context.brand.terracotta,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ],
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: _submit,
          icon: const Icon(Icons.send_rounded),
          label: const Text('Send request'),
        ),
      ],
    );
  }

  void _submit() {
    final contact = _contact.text.trim();
    if (contact.isEmpty) {
      setState(() => _error = 'Leave a way for the project to reach you.');
      return;
    }
    Navigator.pop(
      context,
      ShopOrderDraft(lines: widget.lines, contact: contact, note: _note.text),
    );
  }
}
