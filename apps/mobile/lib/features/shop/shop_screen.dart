import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/shared/channel_stage.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

import 'package:indigen_world_mobile/features/shop/shop_checkout.dart';
import 'package:indigen_world_mobile/features/shop/shop_repository.dart';

/// The shop's four destinations, in rail order.
enum ShopTab { home, categories, cart, profile }

/// The store: its own four-tab channel, on the same glass rail as the rest of
/// the app.
///
/// ── Why the app rail and not a Material bar ──────────────────────────────
/// The shop opened with a stock `NavigationBar` — a second, different-looking
/// bottom bar that appeared the moment somebody tapped the Shop tile. Music
/// had already solved this: a channel keeps the frosted rail and swaps its
/// destinations, and the two are one hero so the rail stays put while its
/// contents change. The shop does exactly that now, so going from Collection
/// to the shop reads as moving deeper into the app rather than leaving it.
class ShopCollectionScreen extends ConsumerStatefulWidget {
  const ShopCollectionScreen({this.category, this.initialTab = 0, super.key});
  final String? category;
  final int initialTab;
  @override
  ConsumerState<ShopCollectionScreen> createState() =>
      _ShopCollectionScreenState();
}

class _ShopCollectionScreenState extends ConsumerState<ShopCollectionScreen>
    with SingleTickerProviderStateMixin {
  int _tab = 0;
  late final _visited = <int>{};
  final _scrolls = List<ScrollController>.generate(
    ShopTab.values.length,
    (_) => ScrollController(),
  );
  late final AnimationController _switch = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
  )..value = 1;
  late final Animation<double> _fade = Tween<double>(
    begin: 0.6,
    end: 1,
  ).animate(CurvedAnimation(parent: _switch, curve: AppMotion.arrive));
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0.02, 0),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _switch, curve: AppMotion.arrive));

  String? _category, _cursor, _account;
  String _search = '', _sort = 'order';
  bool _descending = false,
      _available = false,
      _busy = true,
      _loadingMore = false;
  String? _error;
  List<ShopRow> _products = [], _cart = [], _saved = [], _recent = [];
  ShopRow _config = {};
  Timer? _debounce;
  Future<void> _sync = Future.value();
  bool _mergingGuest = false;
  String _maker = '';

  /// One variant option to filter by, as `Key=Value` (e.g. `Size=A3`).
  String? _attribute;
  int? _minimumPrice, _maximumPrice;
  final _searchController = TextEditingController();
  int _generation = 0;
  ShopRepository get _api => ref.read(shopRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab.clamp(0, 3);
    _visited.add(_tab);
    _category = widget.category;
    _scrolls[ShopTab.home.index].addListener(_autoLoad);
    unawaited(_load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    for (final scroll in _scrolls) {
      scroll.dispose();
    }
    _switch.dispose();
    super.dispose();
  }

  /// Pages arrive as the reader nears the end, rather than behind a button
  /// they have to notice.
  void _autoLoad() {
    final scroll = _scrolls[ShopTab.home.index];
    if (!scroll.hasClients || _cursor == null || _loadingMore || _busy) return;
    if (scroll.position.extentAfter < 600) unawaited(_load(more: true));
  }

  void _select(int index) {
    if (index == _tab) {
      final scroll = _scrolls[index];
      if (scroll.hasClients && scroll.offset > 0) {
        scroll.animateTo(
          0,
          duration: motionOr(context, AppMotion.emphasized),
          curve: AppMotion.arrive,
        );
      }
      HapticFeedback.selectionClick();
      return;
    }
    setState(() {
      _tab = index;
      _visited.add(index);
    });
    if (motionAllowed(context)) _switch.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  int get _activeFilters => [
    _category != null,
    _available,
    _maker.isNotEmpty,
    _attribute != null,
    _minimumPrice != null || _maximumPrice != null,
  ].where((v) => v).length;

  int get _cartCount =>
      _cart.fold<int>(0, (sum, l) => sum + (l['quantity'] as num).toInt());

  Future<void> _load({bool more = false}) async {
    final generation = ++_generation;
    if (!more) {
      setState(() {
        _busy = true;
        _error = null;
      });
    } else {
      setState(() => _loadingMore = true);
    }
    try {
      final config = await _api.map('config');
      final result = await _api.map('catalogue', {
        'category': _category,
        'search': _search,
        'sort': _sort,
        'desc': _descending,
        'available': _available,
        'maker': _maker,
        'attribute': _attribute,
        'minimumPrice': _minimumPrice,
        'maximumPrice': _maximumPrice,
        if (more) 'cursor': _cursor,
      });
      if (!mounted || generation != _generation) return;
      setState(() {
        _config = config;
        _products = more
            ? {
                for (final p in [..._products, ...shopRows(result['items'])])
                  p['id']: p,
              }.values.toList()
            : shopRows(result['items']);
        _cursor = result['cursor'] as String?;
        _busy = false;
        _loadingMore = false;
      });
    } on Object catch (e) {
      if (mounted && generation == _generation) {
        setState(() {
          _error = _friendly(e);
          _busy = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _restoreAccount(String account) async {
    _account = account;
    final data = await ShopLocalStore(account).read();
    if (!mounted || _account != account) return;
    setState(() {
      _cart = shopRows(data['cart']);
      _saved = shopRows(data['saved']);
      _recent = shopRows(data['recent']);
    });
    if (account != 'guest' && !_mergingGuest) {
      try {
        final cart = await _api.map('cart');
        final wishlist = await _api.map('wishlist');
        if (!mounted || _account != account || _mergingGuest) return;
        setState(() {
          _cart = shopRows(cart['lines']);
          _saved = shopRows(wishlist['items']);
        });
        await ShopLocalStore(account)
            .write({'cart': _cart, 'saved': _saved, 'recent': _recent});
      } on Object {
        if (mounted && _account == account) {
          _message(
            'Showing your saved device cart. Refresh when connected to sync your account cart.',
          );
        }
      }
    }
  }

  Future<void> _persist() async {
    final account = _account ?? 'guest';
    final snapshot = jsonDecode(
      jsonEncode({'cart': _cart, 'saved': _saved, 'recent': _recent}),
    ) as Map<String, dynamic>;
    try {
      await ShopLocalStore(account).write(snapshot);
      if (account != 'guest' && !_mergingGuest) {
        _sync = _sync.catchError((Object _) {}).then((_) async {
          if (ref.read(firebaseAuthProvider)?.currentUser?.uid != account) {
            return;
          }
          await _api.map('saveCart', {'lines': shopRows(snapshot['cart'])});
          await _api.map('saveWishlist', {
            'ids': shopRows(snapshot['saved']).map((p) => p['id']).toList(),
          });
        });
        await _sync;
      }
    } on Object {
      if (mounted) {
        _message(
          'Cart synchronization failed. Your device copy is available; retry when connected.',
        );
      }
    }
  }

  void _message(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  bool _isSaved(ShopRow p) => _saved.any((s) => s['id'] == p['id']);

  void _save(ShopRow product) {
    HapticFeedback.selectionClick();
    setState(() {
      _isSaved(product)
          ? _saved.removeWhere((p) => p['id'] == product['id'])
          : _saved.add(product);
    });
    unawaited(_persist());
  }

  void _add(ShopRow product, String variant, int quantity) {
    final line = <String, dynamic>{
      'productId': product['id'],
      'variantId': variant,
      'quantity': quantity,
      'product': product,
    };
    final index = _cart.indexWhere((row) => cartKey(row) == cartKey(line));
    setState(() {
      if (index < 0) {
        _cart.add(line);
      } else {
        _cart[index]['quantity'] =
            ((_cart[index]['quantity'] as num) + quantity).clamp(1, 20);
      }
    });
    unawaited(_persist());
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${product['name'] ?? 'Item'} is in your cart'),
        action: SnackBarAction(
          label: 'View cart',
          onPressed: () => _select(ShopTab.cart.index),
        ),
      ),
    );
  }

  Future<void> _openProduct(ShopRow product) async {
    setState(
      () => _recent = [
        product,
        ..._recent.where((p) => p['id'] != product['id']),
      ].take(30).toList(),
    );
    unawaited(_persist());
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ShopProductScreen(
          productId: product['id'],
          initial: product,
          onAdd: _add,
          onSave: () => _save(product),
          saved: _isSaved(product),
        ),
      ),
    );
  }

  Future<void> _checkout() async {
    if (_cart.isEmpty) return;
    final guestLines = List<ShopRow>.from(_cart);
    var user = ref.read(firebaseAuthProvider)?.currentUser;
    final mergingGuest = user == null;
    if (user == null) {
      _mergingGuest = true;
      if (await showSignInSheet(context) != true || !mounted) {
        _mergingGuest = false;
        return;
      }
      user = ref.read(firebaseAuthProvider)?.currentUser;
    }
    if (user == null) return;
    try {
      final merged = await _api.map(mergingGuest ? 'mergeCart' : 'saveCart', {
        'mergeKey': await ShopLocalStore('guest').mergeKey(),
        'lines': guestLines
            .map(
              (l) => {
                'productId': l['productId'],
                'variantId': l['variantId'],
                'quantity': l['quantity'],
              },
            )
            .toList(),
      });
      if (!mounted) return;
      final selected = shopRows(merged['lines']);
      if (mergingGuest) {
        final guestStore = ShopLocalStore('guest');
        await guestStore.finishMerge();
      }
      _mergingGuest = false;
      final canonical = await _api.map('cart');
      if (!mounted) return;
      setState(() => _cart = shopRows(canonical['lines']));
      await _persist();
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => ShopCheckoutScreen(lines: selected, config: _config),
        ),
      );
      if (mounted && _account == user.uid) await _restoreAccount(user.uid);
    } on Object catch (e) {
      if (mounted) _message(_friendly(e));
    } finally {
      _mergingGuest = false;
    }
  }

  Future<void> _filters() async {
    final maker = TextEditingController(text: _maker);
    final minimum = TextEditingController(
      text: _minimumPrice == null ? '' : '${_minimumPrice! / 100}',
    );
    final maximum = TextEditingController(
      text: _maximumPrice == null ? '' : '${_maximumPrice! / 100}',
    );
    var available = _available;
    var category = _category;
    var attribute = _attribute;
    final categories = shopRows(_config['categories']);
    final facets = <String, List<String>>{
      for (final entry in (Map<String, dynamic>.from(
        _config['facets'] as Map? ?? {},
      )).entries)
        if (entry.value is List)
          entry.key: [for (final v in entry.value as List) '$v'],
    };
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: context.brand.surface,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            0,
            20,
            MediaQuery.viewInsetsOf(sheet).bottom + 24,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Filter the shop',
                  style: TextStyle(
                    color: context.brand.ink,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (categories.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const _SheetLabel('Category'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final c in [
                        null,
                        ...categories.map((c) => '${c['name']}'),
                      ])
                        _Pill(
                          label: c ?? 'All',
                          selected: category == c,
                          onTap: () => setSheet(() => category = c),
                        ),
                    ],
                  ),
                ],
                for (final facet in facets.entries) ...[
                  const SizedBox(height: 18),
                  _SheetLabel(facet.key),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final value in facet.value)
                        _Pill(
                          label: value,
                          selected: attribute == '${facet.key}=$value',
                          // One option at a time: the catalogue can match one.
                          onTap: () => setSheet(
                            () => attribute = attribute == '${facet.key}=$value'
                                ? null
                                : '${facet.key}=$value',
                          ),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                const _SheetLabel('Availability'),
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  value: available,
                  onChanged: (v) => setSheet(() => available = v),
                  title: const Text('In stock only'),
                ),
                const SizedBox(height: 6),
                const _SheetLabel('Price (GHS)'),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: minimum,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(labelText: 'From'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: maximum,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(labelText: 'To'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                const _SheetLabel('Maker'),
                TextField(
                  controller: maker,
                  decoration: const InputDecoration(
                    hintText: 'Exact maker name',
                  ),
                ),
                const SizedBox(height: 24),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          _maker = '';
                          _minimumPrice = null;
                          _maximumPrice = null;
                          _category = null;
                          _available = false;
                          _attribute = null;
                          Navigator.pop(sheet);
                          _load();
                        },
                        child: const Text('Clear all'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: () {
                          _maker = maker.text.trim();
                          _minimumPrice = _filterPrice(minimum.text);
                          _maximumPrice = _filterPrice(maximum.text);
                          _available = available;
                          _category = category;
                          _attribute = attribute;
                          // The catalogue can only range over price while
                          // ordered by price, so a price filter brings its
                          // sort with it.
                          if ((_minimumPrice != null ||
                                  _maximumPrice != null) &&
                              _sort != 'priceMinor') {
                            _sort = 'priceMinor';
                            _descending = false;
                          }
                          Navigator.pop(sheet);
                          _load();
                        },
                        child: const Text('Show results'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
    maker.dispose();
    minimum.dispose();
    maximum.dispose();
  }

  String get _sortValue =>
      _sort == 'priceMinor' ? (_descending ? 'priceDesc' : 'priceAsc') : _sort;

  void _setSort(String value) {
    if (value == _sortValue) return;
    // Leaving a price order means leaving a price range behind with it.
    if (!value.startsWith('price')) {
      _minimumPrice = null;
      _maximumPrice = null;
    }
    _sort = value.startsWith('price') ? 'priceMinor' : value;
    _descending = value == 'priceDesc' || value == 'createdAt';
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).asData?.value;
    final account = user?.uid ?? 'guest';
    if (_account != account) {
      _account = account;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _restoreAccount(account),
      );
    }
    final brand = context.brand;
    return PopScope<void>(
      // Back from another tab goes to the shop's Home first, the way Music's
      // does; back from Home returns to Collections.
      canPop: _tab == ShopTab.home.index,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _select(ShopTab.home.index);
      },
      child: Scaffold(
        backgroundColor: brand.background,
        extendBody: true,
        body: FadeTransition(
          opacity: _fade,
          child: SlideTransition(
            position: _slide,
            child: IndexedStack(
              index: _tab,
              children: [
                for (var index = 0; index < ShopTab.values.length; index++)
                  TickerMode(
                    enabled: index == _tab,
                    child: _visited.contains(index)
                        ? switch (ShopTab.values[index]) {
                            ShopTab.home => _home(),
                            ShopTab.categories => _categories(),
                            ShopTab.cart => _cartView(),
                            ShopTab.profile => ShopProfileScreen(
                              config: _config,
                              scrollController: _scrolls[index],
                              savedCount: _saved.length,
                              onOpenSaved: _showSaved,
                            ),
                          }
                        : const SizedBox.shrink(),
                  ),
              ],
            ),
          ),
        ),
        bottomNavigationBar: FrostedNavBar(
          currentIndex: _tab,
          onTap: _select,
          heroTag: kAppRailHeroTag,
          items: [
            const FrostedNavBarItem(
              icon: Icons.storefront_outlined,
              selectedIcon: Icons.storefront_rounded,
              label: 'Home',
            ),
            const FrostedNavBarItem(
              icon: Icons.grid_view_outlined,
              selectedIcon: Icons.grid_view_rounded,
              label: 'Categories',
            ),
            FrostedNavBarItem(
              icon: Icons.shopping_bag_outlined,
              selectedIcon: Icons.shopping_bag_rounded,
              label: 'Cart',
              badgeCount: _cartCount,
            ),
            const FrostedNavBarItem(
              icon: Icons.person_outline_rounded,
              selectedIcon: Icons.person_rounded,
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }

  double get _textScale =>
      MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.4);

  Widget _savedAction() => IconButton(
    tooltip: _saved.isEmpty ? 'Saved items' : 'Saved items, ${_saved.length}',
    onPressed: _showSaved,
    icon: Badge(
      isLabelVisible: _saved.isNotEmpty,
      label: Text('${_saved.length}'),
      backgroundColor: context.brand.gold,
      textColor: context.brand.heroDeep,
      child: const Icon(Icons.favorite_border_rounded),
    ),
  );

  Widget _home() {
    final brand = context.brand;
    final browsing =
        _search.isEmpty && _activeFilters == 0 && _sortValue == 'order';
    final newest = browsing && _products.length >= 6
        ? ([..._products.where((p) => p['createdAt'] != null)]..sort(
                (a, b) => '${b['createdAt']}'.compareTo('${a['createdAt']}'),
              ))
              .take(8)
              .toList()
        : const <ShopRow>[];
    final categories = shopRows(_config['categories']);
    return RefreshIndicator(
      onRefresh: _load,
      edgeOffset: MediaQuery.paddingOf(context).top + 120,
      child: CustomScrollView(
        key: const PageStorageKey('shop-home-v3'),
        controller: _scrolls[ShopTab.home.index],
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: ChannelStageDelegate(
              eyebrow: 'Indigen World Shop',
              title: 'Made with meaning.',
              subtitle: 'Things our community makes, sold by Indigen World.',
              topPadding: MediaQuery.paddingOf(context).top,
              textScale: _textScale,
              actions: [_savedAction()],
              bottomHeight: ChannelSearchPill.height,
              bottom: ChannelSearchPill(
                controller: _searchController,
                hint: 'Search the shop',
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 400), () {
                    _search = v.trim();
                    _load();
                  });
                },
                onClear: () {
                  _searchController.clear();
                  _search = '';
                  _load();
                },
                trailing: _FilterButton(count: _activeFilters, onTap: _filters),
              ),
            ),
          ),
          if (browsing && categories.isNotEmpty)
            SliverToBoxAdapter(
              child: SizedBox(
                height: 104,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 14),
                  itemBuilder: (context, index) {
                    final c = categories[index];
                    return _CategoryBubble(
                      name: '${c['name'] ?? ''}',
                      imageUrl: '${c['imageUrl'] ?? ''}',
                      onTap: () {
                        setState(() => _category = '${c['name']}');
                        _load();
                      },
                    );
                  },
                ),
              ),
            ),
          SliverToBoxAdapter(
            child: _SortBar(
              sort: _sortValue,
              count: _busy ? null : _products.length,
              more: _cursor != null,
              category: _category,
              available: _available,
              onSort: _setSort,
              onToggleAvailable: () {
                _available = !_available;
                _load();
              },
              onClearCategory: () {
                _category = null;
                _load();
              },
            ),
          ),
          if (_error != null)
            SliverToBoxAdapter(
              child: _ShopState(
                icon: Icons.cloud_off_outlined,
                title: 'Could not load the shop',
                body: _error!,
                action: OutlinedButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try again'),
                ),
              ),
            )
          else if (_busy)
            const _ProductGridSkeleton()
          else if (_products.isEmpty)
            SliverToBoxAdapter(
              child: _ShopState(
                icon: Icons.storefront_outlined,
                title: browsing
                    ? 'The shelves are being stocked'
                    : 'No matches',
                body: browsing
                    ? 'Products appear here as soon as the store publishes them.'
                    : 'Try another search, or clear your filters.',
                action: browsing
                    ? null
                    : OutlinedButton(
                        onPressed: () {
                          _searchController.clear();
                          _search = '';
                          _maker = '';
                          _minimumPrice = null;
                          _maximumPrice = null;
                          _category = null;
                          _available = false;
                          _attribute = null;
                          _sort = 'order';
                          _descending = false;
                          _load();
                        },
                        child: const Text('Clear search and filters'),
                      ),
              ),
            )
          else ...[
            if (newest.isNotEmpty) ...[
              const SliverToBoxAdapter(
                child: ChannelSectionHeader(
                  eyebrow: 'Just in',
                  title: 'New arrivals',
                ),
              ),
              SliverToBoxAdapter(
                child: _ProductShelf(
                  products: newest,
                  isSaved: _isSaved,
                  onOpen: _openProduct,
                ),
              ),
            ],
            if (browsing && _recent.length >= 2) ...[
              ChannelSectionHeader(
                eyebrow: 'Pick up where you left off',
                title: 'Recently viewed',
                action: 'Clear',
                onAction: () {
                  setState(() => _recent = []);
                  _persist();
                },
              ).sliver,
              SliverToBoxAdapter(
                child: _ProductShelf(
                  products: _recent.take(10).toList(),
                  isSaved: _isSaved,
                  onOpen: _openProduct,
                  compact: true,
                ),
              ),
            ],
            SliverToBoxAdapter(
              child: ChannelSectionHeader(
                eyebrow: _category ?? (browsing ? 'The whole shop' : 'Results'),
                title: browsing ? 'Everything' : 'Matching products',
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverLayoutBuilder(
                builder: (context, constraints) => SliverGrid.builder(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: constraints.crossAxisExtent >= 700 ? 3 : 2,
                    mainAxisExtent: _ProductCard.extent(
                      context,
                      (constraints.crossAxisExtent -
                              14 *
                                  ((constraints.crossAxisExtent >= 700
                                          ? 3
                                          : 2) -
                                      1)) /
                          (constraints.crossAxisExtent >= 700 ? 3 : 2),
                    ),
                    mainAxisSpacing: 18,
                    crossAxisSpacing: 14,
                  ),
                  itemCount: _products.length,
                  itemBuilder: (context, index) {
                    final p = _products[index];
                    return Entrance(
                      index: index % 8,
                      child: _ProductCard(
                        product: p,
                        saved: _isSaved(p),
                        onOpen: () => _openProduct(p),
                        onSave: () => _save(p),
                        onQuickAdd: _quickAddable(p)
                            ? () => _add(p, 'default', 1)
                            : null,
                      ),
                    );
                  },
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
                child: Center(
                  child: _loadingMore
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.4),
                        )
                      : _cursor != null
                      ? TextButton(
                          onPressed: () => _load(more: true),
                          child: const Text('Show more'),
                        )
                      : Text(
                          "That's everything for now.",
                          style: TextStyle(color: brand.mutedInk),
                        ),
                ),
              ),
            ),
          ],
          SliverToBoxAdapter(
            child: SizedBox(height: shellBottomReserve(context) + 12),
          ),
        ],
      ),
    );
  }

  /// One tap from the grid is only honest for a fixed-price, in-stock product
  /// with nothing to choose. Anything with variants needs its page.
  bool _quickAddable(ShopRow p) =>
      p['inStock'] != false &&
      !isQuoteOnly(p) &&
      shopRows(p['variants']).isEmpty &&
      p['kind'] != 'digital';

  Widget _categories() {
    final categories = shopRows(_config['categories']);
    return CustomScrollView(
      key: const PageStorageKey('shop-categories'),
      controller: _scrolls[ShopTab.categories.index],
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: ChannelStageDelegate(
            eyebrow: 'Browse',
            title: 'Categories',
            subtitle: 'Every shelf in the shop.',
            topPadding: MediaQuery.paddingOf(context).top,
            textScale: _textScale,
            stageHeight: 96,
            actions: [_savedAction()],
          ),
        ),
        if (_busy && categories.isEmpty)
          const _ProductGridSkeleton(tiles: 4, ratio: 1.15)
        else if (categories.isEmpty)
          SliverToBoxAdapter(
            child: _ShopState(
              icon: Icons.grid_view_rounded,
              title: 'Categories are being prepared',
              body: 'Everything published is on the shop’s Home.',
              action: OutlinedButton(
                onPressed: () => _select(ShopTab.home.index),
                child: const Text('Browse everything'),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 240,
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                childAspectRatio: 1.05,
              ),
              itemCount: categories.length,
              itemBuilder: (context, index) {
                final c = categories[index];
                return Entrance(
                  index: index,
                  child: _CategoryTile(
                    name: '${c['name'] ?? ''}',
                    imageUrl: '${c['imageUrl'] ?? ''}',
                    tint: _tileTint(context.brand, index),
                    selected: _category == c['name'],
                    onTap: () {
                      setState(() => _category = '${c['name']}');
                      _select(ShopTab.home.index);
                      _load();
                    },
                  ),
                );
              },
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }

  Widget _cartView() {
    final brand = context.brand;
    final ready = _config['checkoutReady'] == true;
    final subtotal = _cart.fold<int>(0, (sum, line) {
      final p = Map<String, dynamic>.from(line['product'] as Map? ?? {});
      final unit = _linePrice(p, line['variantId']);
      return sum + (unit ?? 0) * (line['quantity'] as num).toInt();
    });
    final hasQuote = _cart.any(
      (line) =>
          _linePrice(
            Map<String, dynamic>.from(line['product'] as Map? ?? {}),
            line['variantId'],
          ) ==
          null,
    );
    final currency =
        (_cart.firstOrNull?['product'] as Map?)?['currency'] ?? 'GHS';
    return CustomScrollView(
      key: const PageStorageKey('shop-cart'),
      controller: _scrolls[ShopTab.cart.index],
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: ChannelStageDelegate(
            eyebrow: 'Your bag',
            title: 'Cart',
            subtitle: _cart.isEmpty
                ? 'Nothing in it yet.'
                : '$_cartCount ${_cartCount == 1 ? 'item' : 'items'} saved on this device${_account == 'guest' ? '' : ' and your account'}.',
            topPadding: MediaQuery.paddingOf(context).top,
            textScale: _textScale,
            stageHeight: 96,
          ),
        ),
        if (_cart.isEmpty)
          SliverToBoxAdapter(
            child: _ShopState(
              icon: Icons.shopping_bag_outlined,
              title: 'Your cart is waiting',
              body: 'Find something you love — it stays here until you are ready.',
              action: FilledButton(
                onPressed: () => _select(ShopTab.home.index),
                child: const Text('Start browsing'),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverList.separated(
              itemCount: _cart.length,
              separatorBuilder: (_, _) => Divider(color: brand.divider),
              itemBuilder: (context, index) {
                final line = _cart[index];
                final p = Map<String, dynamic>.from(
                  line['product'] as Map? ?? {},
                );
                return _CartLine(
                  product: p,
                  line: line,
                  unitPrice: _linePrice(p, line['variantId']),
                  onOpen: p['id'] == null ? null : () => _openProduct(p),
                  onQuantity: (next) {
                    setState(() {
                      if (next < 1) {
                        _cart.remove(line);
                      } else {
                        line['quantity'] = next.clamp(1, 20);
                      }
                    });
                    HapticFeedback.selectionClick();
                    _persist();
                  },
                  onRemove: () {
                    setState(() => _cart.remove(line));
                    _persist();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text('Removed ${p['name'] ?? 'item'}'),
                        action: SnackBarAction(
                          label: 'Undo',
                          onPressed: () {
                            setState(
                              () => _cart.insert(
                                index.clamp(0, _cart.length),
                                line,
                              ),
                            );
                            _persist();
                          },
                        ),
                      ),
                    );
                  },
                  onSaveForLater: () {
                    if (!_isSaved(p)) _save(p);
                    setState(() => _cart.remove(line));
                    _persist();
                  },
                );
              },
            ),
          ),
        if (_cart.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
              child: _CartSummary(
                subtotal: shopMoney(subtotal, currency),
                hasQuote: hasQuote,
                ready: ready,
                onCheckout: ready ? _checkout : null,
              ),
            ),
          ),
        if (_saved.isNotEmpty) ...[
          const SliverToBoxAdapter(
            child: ChannelSectionHeader(
              eyebrow: 'Saved for later',
              title: 'Your wishlist',
            ),
          ),
          SliverToBoxAdapter(
            child: _ProductShelf(
              products: _saved,
              isSaved: _isSaved,
              onOpen: _openProduct,
              compact: true,
            ),
          ),
        ],
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }

  Future<void> _showSaved() async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => StatefulBuilder(
          builder: (context, setPage) => Scaffold(
            backgroundColor: context.brand.background,
            appBar: AppBar(title: const Text('Saved items')),
            body: _saved.isEmpty
                ? const _ShopState(
                    icon: Icons.favorite_border_rounded,
                    title: 'Nothing saved yet',
                    body: 'Tap the heart on anything you want to come back to.',
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(16),
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisExtent: _ProductCard.extent(
                        context,
                        (MediaQuery.sizeOf(context).width - 46) / 2,
                      ),
                      mainAxisSpacing: 18,
                      crossAxisSpacing: 14,
                    ),
                    itemCount: _saved.length,
                    itemBuilder: (context, index) {
                      final p = _saved[index];
                      return _ProductCard(
                        product: p,
                        saved: true,
                        onOpen: () => _openProduct(p),
                        onSave: () {
                          _save(p);
                          setPage(() {});
                        },
                      );
                    },
                  ),
          ),
        ),
      ),
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

String _friendly(Object e) =>
    e.toString().replaceFirst(RegExp(r'^\[[^\]]+\]\s*'), '');

int? _filterPrice(String text) {
  final value = double.tryParse(text);
  return value == null || !value.isFinite
      ? null
      : (value.clamp(0, 1000000) * 100).round();
}

/// A legacy zero price means "ask", never "free".
bool isQuoteOnly(ShopRow p) =>
    p['priceMode'] == 'quote' || (p['priceMinor'] as num? ?? 0) <= 0;

/// The unit price of a cart line as the device last saw it, or null when the
/// product is quote-only. Checkout reprices on the server either way.
int? _linePrice(ShopRow p, dynamic variantId) {
  if (isQuoteOnly(p)) return null;
  final variant = shopRows(p['variants'])
      .where((v) => v['id'] == variantId)
      .firstOrNull;
  return ((variant?['priceMinor'] ?? p['priceMinor']) as num?)?.toInt();
}

Color _tileTint(BrandPalette brand, int index) => [
  brand.accent,
  brand.terracotta,
  brand.heroMid,
  brand.gold,
  brand.repost,
][index % 5];

List<ShopRow> _gallery(ShopRow p) {
  final gallery = shopRows(p['gallery'])
      .where((a) => '${a['url'] ?? ''}'.isNotEmpty)
      .toList();
  if (gallery.isNotEmpty) return gallery;
  return [
    {'url': p['imageUrl'] ?? '', 'alt': p['name'] ?? ''},
  ];
}

extension on Widget {
  Widget get sliver => SliverToBoxAdapter(child: this);
}

// ── Building blocks ─────────────────────────────────────────────────────────

class ShopImage extends StatelessWidget {
  const ShopImage({
    required this.url,
    required this.alt,
    this.radius = 12,
    this.cacheWidth = 800,
    super.key,
  });
  final String url, alt;
  final double radius;
  final int cacheWidth;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final placeholder = ColoredBox(
      color: brand.surfaceMuted,
      child: Center(
        child: Icon(Icons.image_outlined, color: brand.faintInk, size: 28),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: url.isEmpty
          ? placeholder
          : CachedNetworkImage(
              imageUrl: url,
              memCacheWidth: cacheWidth,
              fit: BoxFit.cover,
              fadeInDuration: motionOr(context, AppMotion.quick),
              imageBuilder: (context, provider) =>
                  Image(image: provider, fit: BoxFit.cover, semanticLabel: alt),
              placeholder: (_, _) => ColoredBox(color: brand.surfaceMuted),
              errorWidget: (_, _, _) => ColoredBox(
                color: brand.surfaceMuted,
                child: Center(
                  child: Icon(
                    Icons.broken_image_outlined,
                    color: brand.faintInk,
                  ),
                ),
              ),
            ),
    );
  }
}

class _SheetLabel extends StatelessWidget {
  const _SheetLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        color: context.brand.terracotta,
        fontSize: 10.5,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.1,
      ),
    ),
  );
}

/// A small rounded choice, the app's pill rather than Material's chip.
class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? brand.accentFill : brand.surface,
        shape: StadiumBorder(
          side: BorderSide(color: selected ? brand.accentFill : brand.border),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 36),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(
                      icon,
                      size: 16,
                      color: selected ? brand.onAccentFill : brand.ink,
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    label,
                    style: TextStyle(
                      color: selected ? brand.onAccentFill : brand.ink,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: count == 0 ? 'Filters' : 'Filters, $count active',
      child: Material(
        color: count == 0 ? brand.surface : brand.gold,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(
                  Icons.tune_rounded,
                  color: count == 0 ? brand.ink : brand.heroDeep,
                ),
                if (count > 0)
                  Positioned(
                    top: 7,
                    right: 7,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: brand.heroDeep,
                        shape: BoxShape.circle,
                      ),
                      child: Text(
                        '$count',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SortBar extends StatelessWidget {
  const _SortBar({
    required this.sort,
    required this.count,
    required this.more,
    required this.category,
    required this.available,
    required this.onSort,
    required this.onToggleAvailable,
    required this.onClearCategory,
  });
  final String sort;
  final int? count;
  final bool more;
  final String? category;
  final bool available;
  final ValueChanged<String> onSort;
  final VoidCallback onToggleAvailable, onClearCategory;

  static const _labels = {
    'order': 'Recommended',
    'createdAt': 'Newest',
    'priceAsc': 'Price: low to high',
    'priceDesc': 'Price: high to low',
  };

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          PopupMenuButton<String>(
            tooltip: 'Sort products',
            initialValue: sort,
            onSelected: onSort,
            position: PopupMenuPosition.under,
            itemBuilder: (_) => [
              for (final entry in _labels.entries)
                CheckedPopupMenuItem(
                  value: entry.key,
                  checked: entry.key == sort,
                  child: Text(entry.value),
                ),
            ],
            child: IgnorePointer(
              child: _Pill(
                label: _labels[sort] ?? 'Recommended',
                icon: Icons.swap_vert_rounded,
                selected: false,
                onTap: () {},
              ),
            ),
          ),
          _Pill(
            label: 'In stock',
            icon: available ? Icons.check_rounded : null,
            selected: available,
            onTap: onToggleAvailable,
          ),
          if (category != null)
            _Pill(
              label: category!,
              icon: Icons.close_rounded,
              selected: true,
              onTap: onClearCategory,
            ),
          if (count != null)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text(
                '$count${more ? '+' : ''} ${count == 1 ? 'product' : 'products'}',
                style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _CategoryBubble extends StatelessWidget {
  const _CategoryBubble({
    required this.name,
    required this.imageUrl,
    required this.onTap,
  });
  final String name, imageUrl;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: 'Category $name',
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: SizedBox(
          width: 68,
          child: Column(
            children: [
              Container(
                width: 60,
                height: 60,
                padding: const EdgeInsets.all(2.5),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: [brand.gold, brand.accent]),
                ),
                child: ClipOval(
                  child: imageUrl.isEmpty
                      ? ColoredBox(
                          color: brand.surface,
                          child: Center(
                            child: Text(
                              name.isEmpty ? '?' : name[0].toUpperCase(),
                              style: TextStyle(
                                color: brand.accent,
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        )
                      : ShopImage(
                          url: imageUrl,
                          alt: '',
                          radius: 40,
                          cacheWidth: 200,
                        ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.name,
    required this.imageUrl,
    required this.tint,
    required this.selected,
    required this.onTap,
  });
  final String name, imageUrl;
  final Color tint;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      selected: selected,
      label: 'Category $name',
      excludeSemantics: true,
      child: PressScale(
        child: Material(
          clipBehavior: Clip.antiAlias,
          borderRadius: BorderRadius.circular(22),
          color: Color.lerp(brand.heroDeep, tint, 0.55),
          child: InkWell(
            onTap: onTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (imageUrl.isNotEmpty)
                  ShopImage(url: imageUrl, alt: '', radius: 0, cacheWidth: 500),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        brand.heroDeep.withValues(alpha: 0.82),
                      ],
                      stops: const [0.35, 1],
                    ),
                  ),
                ),
                if (imageUrl.isEmpty)
                  Positioned(
                    right: -10,
                    top: -18,
                    child: Text(
                      name.isEmpty ? '' : name[0].toUpperCase(),
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.14),
                        fontSize: 110,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 14,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            height: 1.15,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_rounded,
                        color: Colors.white,
                        size: 18,
                      ),
                    ],
                  ),
                ),
                if (selected)
                  DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: brand.gold, width: 3),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A glass circle laid over a picture: heart, add, share, back.
class _ImageButton extends StatelessWidget {
  const _ImageButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.color,
    this.size = 36,
  });
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final Color? color;
  final double size;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // The visible circle stays small; the target around it is 44px.
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: SizedBox.square(
            dimension: size < 44 ? 44 : size,
            child: Center(
              child: Material(
                color: brand.surface.withValues(alpha: 0.92),
                shape: const CircleBorder(),
                elevation: 1,
                shadowColor: brand.shadow.withValues(alpha: 0.3),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: onTap,
                  child: SizedBox.square(
                    dimension: size,
                    child: Icon(
                      icon,
                      size: size * 0.5,
                      color: color ?? brand.ink,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.saved,
    required this.onOpen,
    required this.onSave,
    this.onQuickAdd,
  });
  final ShopRow product;
  final bool saved;
  final VoidCallback onOpen, onSave;
  final VoidCallback? onQuickAdd;

  static const double _imageRatio = 1.2;

  /// Height for a card [width] wide: picture plus text, grown with the reader's
  /// text size rather than clipped by it.
  static double extent(BuildContext context, double width) {
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
    return width * _imageRatio + 84 * scale + 6;
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final maker = '${product['maker'] ?? ''}';
    final soldOut = product['inStock'] == false;
    final quote = isQuoteOnly(product);
    final gallery = _gallery(product);
    return Semantics(
      button: true,
      label:
          '${product['name'] ?? 'Product'}${maker.isEmpty ? '' : ' by $maker'}, ${shopPrice(product)}${soldOut ? ', sold out' : ''}',
      child: GestureDetector(
        onTap: onOpen,
        behavior: HitTestBehavior.opaque,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 1 / _imageRatio,
              child: PressScale(
                pressed: 0.97,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ExcludeSemantics(
                      child: ShopImage(
                        url: '${gallery.first['url'] ?? ''}',
                        alt: '${gallery.first['alt'] ?? product['name'] ?? ''}',
                        radius: 20,
                        cacheWidth: 600,
                      ),
                    ),
                    if (soldOut)
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: brand.background.withValues(alpha: 0.45),
                          borderRadius: BorderRadius.circular(20),
                        ),
                      ),
                    Positioned(
                      left: 10,
                      top: 10,
                      child: Wrap(
                        spacing: 6,
                        children: [
                          if (soldOut) const _Tag('Sold out', dark: true),
                          if (!soldOut && quote) const _Tag('Ask for a price'),
                          if (gallery.length > 1)
                            _Tag('${gallery.length} photos', icon: true),
                        ],
                      ),
                    ),
                    Positioned(
                      right: 2,
                      top: 2,
                      child: _ImageButton(
                        icon: saved
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                        color: saved ? brand.like : null,
                        tooltip: saved ? 'Remove from saved' : 'Save',
                        size: 32,
                        onTap: onSave,
                      ),
                    ),
                    if (onQuickAdd != null)
                      Positioned(
                        right: 2,
                        bottom: 2,
                        child: _ImageButton(
                          icon: Icons.add_shopping_cart_rounded,
                          tooltip: 'Add to cart',
                          size: 32,
                          onTap: onQuickAdd!,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            ExcludeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (maker.isNotEmpty)
                    Text(
                      maker.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: brand.terracotta,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.9,
                      ),
                    ),
                  Text(
                    '${product['name'] ?? ''}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 14,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    shopPrice(product),
                    style: TextStyle(
                      color: quote ? brand.mutedInk : brand.accent,
                      fontSize: quote ? 13 : 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.dark = false, this.icon = false});
  final String text;
  final bool dark, icon;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: dark
            ? brand.heroDeep.withValues(alpha: 0.88)
            : brand.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon) ...[
            Icon(
              Icons.photo_library_outlined,
              size: 11,
              color: dark ? Colors.white : brand.ink,
            ),
            const SizedBox(width: 3),
          ],
          Text(
            text,
            style: TextStyle(
              color: dark ? Colors.white : brand.ink,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductShelf extends StatelessWidget {
  const _ProductShelf({
    required this.products,
    required this.isSaved,
    required this.onOpen,
    this.compact = false,
  });
  final List<ShopRow> products;
  final bool Function(ShopRow) isSaved;
  final ValueChanged<ShopRow> onOpen;
  final bool compact;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final width = compact ? 118.0 : 156.0;
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.0);
    return SizedBox(
      height: width * 1.15 + 58 * scale,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final p = products[index];
          return Semantics(
            button: true,
            label: '${p['name'] ?? 'Product'}, ${shopPrice(p)}',
            excludeSemantics: true,
            child: GestureDetector(
              onTap: () => onOpen(p),
              child: SizedBox(
                width: width,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: width * 1.15,
                      width: width,
                      child: PressScale(
                        pressed: 0.97,
                        child: ShopImage(
                          url: '${_gallery(p).first['url'] ?? ''}',
                          alt: '',
                          radius: 18,
                          cacheWidth: 400,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${p['name'] ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      shopPrice(p),
                      maxLines: 1,
                      style: TextStyle(
                        color: isQuoteOnly(p) ? brand.mutedInk : brand.accent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ProductGridSkeleton extends StatelessWidget {
  const _ProductGridSkeleton({this.tiles = 6, this.ratio = 0.62});
  final int tiles;
  final double ratio;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      sliver: SliverGrid.builder(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: ratio,
          mainAxisSpacing: 18,
          crossAxisSpacing: 14,
        ),
        itemCount: tiles,
        itemBuilder: (_, _) => DecoratedBox(
          decoration: BoxDecoration(
            color: brand.surfaceMuted,
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
    );
  }
}

class _ShopState extends StatelessWidget {
  const _ShopState({
    required this.icon,
    required this.title,
    required this.body,
    this.action,
  });
  final IconData icon;
  final String title, body;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 48, 32, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: brand.accentSoft,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 32, color: brand.accent),
          ),
          const SizedBox(height: 18),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: brand.ink,
              fontSize: 19,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(color: brand.mutedInk, height: 1.4),
          ),
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.value,
    required this.onChanged,
    this.removeAtMin = false,
  });
  static const min = 1, max = 20;
  final int value;
  final ValueChanged<int> onChanged;
  final bool removeAtMin;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final atMin = value <= min;
    return Container(
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: atMin && removeAtMin ? 'Remove item' : 'Reduce quantity',
            visualDensity: VisualDensity.compact,
            onPressed: atMin && !removeAtMin
                ? null
                : () => onChanged(value - 1),
            icon: Icon(
              atMin && removeAtMin
                  ? Icons.delete_outline_rounded
                  : Icons.remove_rounded,
              size: 18,
            ),
          ),
          Semantics(
            label: 'Quantity $value',
            excludeSemantics: true,
            child: SizedBox(
              width: 22,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: TextStyle(color: brand.ink, fontWeight: FontWeight.w900),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Increase quantity',
            visualDensity: VisualDensity.compact,
            onPressed: value >= max ? null : () => onChanged(value + 1),
            icon: const Icon(Icons.add_rounded, size: 18),
          ),
        ],
      ),
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({
    required this.product,
    required this.line,
    required this.unitPrice,
    required this.onQuantity,
    required this.onRemove,
    required this.onSaveForLater,
    this.onOpen,
  });
  final ShopRow product, line;
  final int? unitPrice;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove, onSaveForLater;
  final VoidCallback? onOpen;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final quantity = (line['quantity'] as num).toInt();
    final variant = shopRows(product['variants'])
        .where((v) => v['id'] == line['variantId'])
        .firstOrNull;
    final currency = product['currency'] ?? 'GHS';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: onOpen,
            child: SizedBox(
              width: 84,
              height: 100,
              child: ShopImage(
                url: '${_gallery(product).first['url'] ?? ''}',
                alt: '${product['name'] ?? ''}',
                radius: 16,
                cacheWidth: 300,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        '${product['name'] ?? line['productId']}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 36,
                      height: 36,
                      child: IconButton(
                        tooltip: 'Remove item',
                        padding: EdgeInsets.zero,
                        onPressed: onRemove,
                        icon: Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: brand.mutedInk,
                        ),
                      ),
                    ),
                  ],
                ),
                if (variant != null)
                  Text(
                    '${variant['name']}',
                    style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                  ),
                const SizedBox(height: 4),
                Text(
                  unitPrice == null
                      ? 'Ask for a price'
                      : shopMoney(unitPrice! * quantity, currency),
                  style: TextStyle(
                    color: unitPrice == null ? brand.mutedInk : brand.accent,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _Stepper(
                      value: quantity,
                      removeAtMin: true,
                      onChanged: onQuantity,
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: onSaveForLater,
                      child: const Text('Save for later'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CartSummary extends StatelessWidget {
  const _CartSummary({
    required this.subtotal,
    required this.hasQuote,
    required this.ready,
    required this.onCheckout,
  });
  final String subtotal;
  final bool hasQuote, ready;
  final VoidCallback? onCheckout;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: brand.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: brand.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Items',
                style: TextStyle(color: brand.mutedInk, fontSize: 14),
              ),
              const Spacer(),
              Text(
                subtotal,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            hasQuote
                ? 'Some items are priced on request and are not included. '
                      'The store confirms prices, stock, delivery and any tax before you pay.'
                : 'The store confirms prices, stock, delivery and any tax before you pay.',
            style: TextStyle(
              color: brand.mutedInk,
              fontSize: 12.5,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onCheckout,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
            ),
            icon: const Icon(Icons.lock_outline_rounded, size: 18),
            label: const Text('Continue to checkout'),
          ),
          if (!ready)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.schedule_rounded, size: 16, color: brand.mutedInk),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Checkout is not open yet. Your cart is kept on this device until it is.',
                      style: TextStyle(
                        color: brand.mutedInk,
                        fontSize: 12.5,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Product page ────────────────────────────────────────────────────────────

class ShopProductScreen extends ConsumerStatefulWidget {
  const ShopProductScreen({
    required this.productId,
    this.initial,
    this.onAdd,
    this.onSave,
    this.saved = false,
    super.key,
  });
  final String productId;
  final ShopRow? initial;
  final void Function(ShopRow, String, int)? onAdd;
  final VoidCallback? onSave;
  final bool saved;
  @override
  ConsumerState<ShopProductScreen> createState() => _ShopProductScreenState();
}

class _ShopProductScreenState extends ConsumerState<ShopProductScreen> {
  ShopRow? _p;
  String? _error, _variant;
  int _quantity = 1, _page = 0;
  bool _saved = false, _buying = false, _fresh = false;
  final _pages = PageController();

  @override
  void initState() {
    super.initState();
    _p = widget.initial;
    _saved = widget.saved;
    _variant = _p == null || shopRows(_p!['variants']).isEmpty
        ? 'default'
        : null;
    _load();
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await ref.read(shopRepositoryProvider).map('product', {
        'id': widget.productId,
      });
      if (mounted) {
        setState(() {
          _p = p;
          _fresh = true;
          final variants = shopRows(p['variants']);
          if (variants.isEmpty) {
            _variant = 'default';
          } else if (!variants.any((v) => v['id'] == _variant)) {
            _variant = null;
          }
        });
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _p = null;
          _error = _friendly(e);
        });
      }
    }
  }

  int? get _unitPrice {
    final p = _p;
    if (p == null || isQuoteOnly(p)) return null;
    final variant = shopRows(p['variants'])
        .where((v) => v['id'] == _variant)
        .firstOrNull;
    return ((variant?['priceMinor'] ?? p['priceMinor']) as num?)?.toInt();
  }

  Future<void> _addToCart(ShopRow p) async {
    if (widget.onAdd != null) {
      widget.onAdd!(p, _variant!, _quantity);
      Navigator.pop(context);
      return;
    }
    final account = ref.read(firebaseAuthProvider)?.currentUser?.uid ?? 'guest';
    final store = ShopLocalStore(account), data = await store.read();
    final lines = shopRows(data['cart']);
    final selectedLine = <String, dynamic>{
      'productId': p['id'],
      'variantId': _variant,
      'quantity': _quantity,
      'product': p,
    };
    final existing = lines.indexWhere(
      (line) => cartKey(line) == cartKey(selectedLine),
    );
    if (existing >= 0) {
      lines[existing]['quantity'] =
          ((lines[existing]['quantity'] as num) + _quantity).clamp(1, 20);
    } else {
      lines.add(selectedLine);
    }
    await store.write({...data, 'cart': lines});
    if (account != 'guest') {
      await ref.read(shopRepositoryProvider).map('saveCart', {'lines': lines});
    }
    if (mounted) {
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
          builder: (_) => const ShopCollectionScreen(initialTab: 2),
        ),
      );
    }
  }

  Future<void> _buyNow(ShopRow p) async {
    if (_buying) return;
    setState(() => _buying = true);
    try {
      if (ref.read(firebaseAuthProvider)?.currentUser == null &&
          await showSignInSheet(context) != true) {
        return;
      }
      final config = await ref.read(shopRepositoryProvider).map('config');
      if (!mounted) return;
      if (config['checkoutReady'] != true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Checkout is not open yet. Save this item and check back.',
            ),
          ),
        );
        return;
      }
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => ShopCheckoutScreen(
            lines: [
              {
                'productId': p['id'],
                'variantId': _variant,
                'quantity': _quantity,
              },
            ],
            config: config,
          ),
        ),
      );
    } on Object catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_friendly(e))));
      }
    } finally {
      if (mounted) setState(() => _buying = false);
    }
  }

  void _zoom(List<ShopRow> gallery, int start) => Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black,
      pageBuilder: (context, _, _) =>
          _ZoomGallery(gallery: gallery, start: start),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final p = _p;
    if (p == null) {
      return Scaffold(
        backgroundColor: brand.background,
        appBar: AppBar(),
        body: Center(
          child: _error == null
              ? const CircularProgressIndicator()
              : _ShopState(
                  icon: Icons.inventory_2_outlined,
                  title: 'This product is unavailable',
                  body: _error!,
                  action: OutlinedButton(
                    onPressed: () => Navigator.maybePop(context),
                    child: const Text('Back to the shop'),
                  ),
                ),
        ),
      );
    }
    final variants = shopRows(p['variants']);
    final gallery = _gallery(p);
    final maker = '${p['maker'] ?? ''}';
    final soldOut = p['inStock'] == false;
    final quote = isQuoteOnly(p);
    final top = MediaQuery.paddingOf(context).top;
    final galleryHeight = (MediaQuery.sizeOf(context).width * 1.08).clamp(
      300.0,
      520.0,
    );
    final description = '${p['description'] ?? p['summary'] ?? ''}'.trim();
    final unit = _unitPrice;

    return Scaffold(
      backgroundColor: brand.background,
      bottomNavigationBar: _ProductActionBar(
        soldOut: soldOut,
        quote: quote,
        busy: _buying,
        needsVariant: _variant == null,
        total: unit == null
            ? null
            : shopMoney(unit * _quantity, p['currency'] ?? 'GHS'),
        onAdd: () => _addToCart(p),
        onBuy: () => _buyNow(p),
        onAsk: _inquiry,
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: SizedBox(
              height: galleryHeight,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  PageView.builder(
                    controller: _pages,
                    itemCount: gallery.length,
                    onPageChanged: (i) => setState(() => _page = i),
                    itemBuilder: (context, index) => GestureDetector(
                      onTap: () => _zoom(gallery, index),
                      child: ShopImage(
                        url: '${gallery[index]['url'] ?? ''}',
                        alt: '${gallery[index]['alt'] ?? p['name'] ?? ''}',
                        radius: 0,
                        cacheWidth: 1200,
                      ),
                    ),
                  ),
                  // Keeps the status bar and the floating buttons legible over
                  // a bright photograph.
                  IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.center,
                          colors: [
                            Colors.black.withValues(alpha: 0.32),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: top + 4,
                    left: 6,
                    child: _ImageButton(
                      icon: Icons.arrow_back_rounded,
                      tooltip: 'Back',
                      onTap: () => Navigator.maybePop(context),
                    ),
                  ),
                  Positioned(
                    top: top + 4,
                    right: 6,
                    child: Row(
                      children: [
                        if (widget.onSave != null)
                          _ImageButton(
                            icon: _saved
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            color: _saved ? brand.like : null,
                            tooltip: _saved ? 'Remove from saved' : 'Save',
                            onTap: () {
                              widget.onSave!();
                              setState(() => _saved = !_saved);
                            },
                          ),
                        _ImageButton(
                          icon: Icons.ios_share_rounded,
                          tooltip: 'Share product',
                          onTap: () => Share.share(
                            'https://indigenworld.com/shop/product/${widget.productId}',
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (gallery.length > 1)
                    Positioned(
                      bottom: 34,
                      left: 0,
                      right: 0,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (var i = 0; i < gallery.length; i++)
                            AnimatedContainer(
                              duration: motionOr(context, AppMotion.quick),
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              width: i == _page ? 18 : 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: i == _page
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.55),
                                borderRadius: BorderRadius.circular(99),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Transform.translate(
              offset: const Offset(0, -22),
              child: Container(
                decoration: BoxDecoration(
                  color: brand.background,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(26),
                  ),
                ),
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (gallery.length > 1) ...[
                      SizedBox(
                        height: 58,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: gallery.length,
                          separatorBuilder: (_, _) => const SizedBox(width: 8),
                          itemBuilder: (context, i) => Semantics(
                            button: true,
                            selected: i == _page,
                            label: 'Photo ${i + 1} of ${gallery.length}',
                            excludeSemantics: true,
                            child: GestureDetector(
                              onTap: () => _pages.animateToPage(
                                i,
                                duration: motionOr(context, AppMotion.standard),
                                curve: AppMotion.arrive,
                              ),
                              child: AnimatedContainer(
                                duration: motionOr(context, AppMotion.quick),
                                width: 58,
                                padding: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: i == _page
                                        ? brand.accent
                                        : Colors.transparent,
                                    width: 2,
                                  ),
                                ),
                                child: ShopImage(
                                  url: '${gallery[i]['url'] ?? ''}',
                                  alt: '',
                                  radius: 10,
                                  cacheWidth: 160,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                    ],
                    if (maker.isNotEmpty)
                      Text(
                        'MADE BY ${maker.toUpperCase()}',
                        style: TextStyle(
                          color: brand.terracotta,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                        ),
                      ),
                    const SizedBox(height: 4),
                    Text(
                      '${p['name'] ?? ''}',
                      style: TextStyle(
                        color: brand.ink,
                        fontSize: 25,
                        height: 1.15,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Text(
                          unit == null
                              ? 'Ask for a price'
                              : shopMoney(unit, p['currency'] ?? 'GHS'),
                          style: TextStyle(
                            color: unit == null ? brand.mutedInk : brand.accent,
                            fontSize: unit == null ? 17 : 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const Spacer(),
                        _StockMark(soldOut: soldOut, confirmed: _fresh),
                      ],
                    ),
                    if (variants.isNotEmpty) ...[
                      const SizedBox(height: 22),
                      const _SheetLabel('Choose an option'),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final v in variants)
                            _Pill(
                              label:
                                  v['priceMinor'] == null ||
                                      v['priceMinor'] == p['priceMinor'] ||
                                      quote
                                  ? '${v['name']}'
                                  : '${v['name']} · ${shopMoney(v['priceMinor'], p['currency'] ?? 'GHS')}',
                              selected: _variant == v['id'],
                              onTap: () =>
                                  setState(() => _variant = '${v['id']}'),
                            ),
                        ],
                      ),
                    ],
                    if (!soldOut && !quote) ...[
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          const _SheetLabel('Quantity'),
                          const Spacer(),
                          _Stepper(
                            value: _quantity,
                            onChanged: (v) => setState(() => _quantity = v),
                          ),
                        ],
                      ),
                    ],
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: 22),
                      const _SheetLabel('About this piece'),
                      Text(
                        description,
                        style: TextStyle(
                          color: brand.ink,
                          fontSize: 15,
                          height: 1.55,
                        ),
                      ),
                    ],
                    const SizedBox(height: 22),
                    const _InfoRow(
                      icon: Icons.local_shipping_outlined,
                      title: 'Delivery',
                      body: 'Options and any costs are shown at checkout, before you pay.',
                    ),
                    _InfoRow(
                      icon: Icons.verified_user_outlined,
                      title: 'Sold by Indigen World',
                      body: maker.isEmpty
                          ? 'Orders, payment and support are handled by the store.'
                          : 'Made by $maker. Orders, payment and support are handled by the store.',
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _inquiry() async {
    if (ref.read(firebaseAuthProvider)?.currentUser == null &&
        await showSignInSheet(context) != true) {
      return;
    }
    if (!mounted) return;
    final contact = TextEditingController(), message = TextEditingController();
    String? error;
    var sending = false;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: context.brand.surface,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            0,
            20,
            MediaQuery.viewInsetsOf(sheet).bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Ask about ${_p?['name'] ?? 'this item'}',
                style: TextStyle(
                  color: context.brand.ink,
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'The store replies with a price and availability.',
                style: TextStyle(color: context.brand.mutedInk),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contact,
                decoration: const InputDecoration(
                  labelText: 'How can the store reach you?',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: message,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Your question'),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    error!,
                    style: TextStyle(color: context.brand.danger),
                  ),
                ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: sending
                    ? null
                    : () async {
                        setSheet(() {
                          sending = true;
                          error = null;
                        });
                        try {
                          await ref.read(shopRepositoryProvider).call('inquiry', {
                            'productId': widget.productId,
                            'requestId':
                                'inquiry-${DateTime.now().microsecondsSinceEpoch}',
                            'contact': contact.text,
                            'message': message.text,
                          });
                          if (sheet.mounted) Navigator.pop(sheet);
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Sent. The store will reply to you.',
                                ),
                              ),
                            );
                          }
                        } on Object catch (e) {
                          setSheet(() {
                            sending = false;
                            error = _friendly(e);
                          });
                        }
                      },
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(50),
                ),
                child: Text(sending ? 'Sending…' : 'Send question'),
              ),
            ],
          ),
        ),
      ),
    );
    contact.dispose();
    message.dispose();
  }
}

class _StockMark extends StatelessWidget {
  const _StockMark({required this.soldOut, required this.confirmed});
  final bool soldOut, confirmed;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = soldOut ? brand.danger : brand.success;
    if (!confirmed && !soldOut) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            soldOut ? Icons.block_rounded : Icons.check_circle_rounded,
            size: 14,
            color: color,
          ),
          const SizedBox(width: 5),
          Text(
            soldOut ? 'Sold out' : 'In stock',
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title, body;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: brand.accentSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 19, color: brand.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: brand.ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  body,
                  style: TextStyle(
                    color: brand.mutedInk,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProductActionBar extends StatelessWidget {
  const _ProductActionBar({
    required this.soldOut,
    required this.quote,
    required this.busy,
    required this.needsVariant,
    required this.total,
    required this.onAdd,
    required this.onBuy,
    required this.onAsk,
  });
  final bool soldOut, quote, busy, needsVariant;
  final String? total;
  final VoidCallback onAdd, onBuy, onAsk;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    Widget content;
    if (soldOut) {
      content = FilledButton(
        onPressed: null,
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        child: const Text('Currently unavailable'),
      );
    } else if (quote) {
      content = FilledButton.icon(
        onPressed: onAsk,
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
        label: const Text('Ask for a price'),
      );
    } else {
      content = Row(
        children: [
          Expanded(
            flex: 2,
            child: OutlinedButton(
              onPressed: needsVariant || busy ? null : onBuy,
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              child: Text(
                busy ? 'Opening…' : 'Buy now',
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.fade,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 3,
            child: FilledButton(
              onPressed: needsVariant ? null : onAdd,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              child: Text(
                needsVariant
                    ? 'Choose an option'
                    : total == null
                    ? 'Add to cart'
                    : 'Add to cart · $total',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      );
    }
    return DecoratedBox(
      decoration: BoxDecoration(
        color: brand.surface,
        border: Border(top: BorderSide(color: brand.divider)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: content,
        ),
      ),
    );
  }
}

class _ZoomGallery extends StatefulWidget {
  const _ZoomGallery({required this.gallery, required this.start});
  final List<ShopRow> gallery;
  final int start;
  @override
  State<_ZoomGallery> createState() => _ZoomGalleryState();
}

class _ZoomGalleryState extends State<_ZoomGallery> {
  late final _controller = PageController(initialPage: widget.start);
  late int _page = widget.start;
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    body: Stack(
      children: [
        PageView.builder(
          controller: _controller,
          itemCount: widget.gallery.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (context, i) => InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Center(
              child: CachedNetworkImage(
                imageUrl: '${widget.gallery[i]['url'] ?? ''}',
                fit: BoxFit.contain,
                imageBuilder: (context, provider) => Image(
                  image: provider,
                  fit: BoxFit.contain,
                  semanticLabel: '${widget.gallery[i]['alt'] ?? ''}',
                ),
                errorWidget: (_, _, _) => const Icon(
                  Icons.broken_image_outlined,
                  color: Colors.white54,
                ),
              ),
            ),
          ),
        ),
        SafeArea(
          child: Row(
            children: [
              const CloseButton(color: Colors.white),
              const Spacer(),
              if (widget.gallery.length > 1)
                Padding(
                  padding: const EdgeInsets.only(right: 16),
                  child: Text(
                    '${_page + 1} / ${widget.gallery.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    ),
  );
}
