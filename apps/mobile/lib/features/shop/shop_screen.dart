import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';

import 'shop_repository.dart';
import 'shop_checkout.dart';

class ShopCollectionScreen extends ConsumerStatefulWidget {
  const ShopCollectionScreen({this.category, this.initialTab = 0, super.key});
  final String? category;
  final int initialTab;
  @override
  ConsumerState<ShopCollectionScreen> createState() =>
      _ShopCollectionScreenState();
}

class _ShopCollectionScreenState extends ConsumerState<ShopCollectionScreen> {
  int _tab = 0;
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
  int? _minimumPrice, _maximumPrice;
  final _searchController = TextEditingController();
  int _generation = 0;
  ShopRepository get _api => ref.read(shopRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab.clamp(0, 3);
    _category = widget.category;
    unawaited(_load());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final generation = ++_generation;
    if (!more)
      setState(() {
        _busy = true;
        _error = null;
      });
    else
      setState(() => _loadingMore = true);
    try {
      final config = await _api.map('config');
      final result = await _api.map('catalogue', {
        'category': _category,
        'search': _search,
        'sort': _sort,
        'desc': _descending,
        'available': _available,
        'maker': _maker,
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
      if (mounted && generation == _generation)
        setState(() {
          _error = _friendly(e);
          _busy = false;
          _loadingMore = false;
        });
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
        if (mounted && _account == account)
          _message(
            'Showing your saved device cart. Refresh when connected to sync your account cart.',
          );
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
          if (ref.read(firebaseAuthProvider)?.currentUser?.uid != account)
            return;
          await _api.map('saveCart', {'lines': shopRows(snapshot['cart'])});
          await _api.map('saveWishlist', {
            'ids': shopRows(snapshot['saved']).map((p) => p['id']).toList(),
          });
        });
        await _sync;
      }
    } on Object {
      if (mounted)
        _message(
          'Cart synchronization failed. Your device copy is available; retry when connected.',
        );
    }
  }

  void _message(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  void _save(ShopRow product) {
    setState(() {
      _saved.any((p) => p['id'] == product['id'])
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
    _message('Added to your cart');
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
          saved: _saved.any((p) => p['id'] == product['id']),
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
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(
          24,
          24,
          24,
          MediaQuery.viewInsetsOf(sheet).bottom + 24,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Filter products',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              TextField(
                controller: maker,
                decoration: const InputDecoration(
                  labelText: 'Maker (exact name)',
                ),
              ),
              TextField(
                controller: minimum,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Minimum price (GHS)',
                ),
              ),
              TextField(
                controller: maximum,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Maximum price (GHS)',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  _maker = maker.text.trim();
                  _minimumPrice = _filterPrice(minimum.text);
                  _maximumPrice = _filterPrice(maximum.text);
                  if (_minimumPrice != null || _maximumPrice != null) {
                    _sort = 'priceMinor';
                    _descending = false;
                  }
                  Navigator.pop(sheet);
                  _load();
                },
                child: const Text('Apply filters'),
              ),
              TextButton(
                onPressed: () {
                  _maker = '';
                  _minimumPrice = null;
                  _maximumPrice = null;
                  _category = null;
                  _available = false;
                  Navigator.pop(sheet);
                  _load();
                },
                child: const Text('Clear all'),
              ),
            ],
          ),
        ),
      ),
    );
    maker.dispose();
    minimum.dispose();
    maximum.dispose();
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
    final titles = ['Shop', 'Categories', 'Your cart', 'Shop profile'];
    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        title: Text(titles[_tab]),
        actions: [
          IconButton(
            tooltip: 'Saved items',
            icon: const Icon(Icons.favorite_border_rounded),
            onPressed: () => _showSaved(),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (v) => setState(() => _tab = v),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.storefront_outlined),
            selectedIcon: Icon(Icons.storefront),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view_rounded),
            label: 'Categories',
          ),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: _cart.isNotEmpty,
              label: Text(
                '${_cart.fold<int>(0, (sum, l) => sum + (l['quantity'] as num).toInt())}',
              ),
              child: const Icon(Icons.shopping_bag_outlined),
            ),
            label: 'Cart',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: IndexedStack(
          index: _tab,
          children: [
            _home(),
            _categories(),
            _cartView(),
            ShopProfileScreen(config: _config),
          ],
        ),
      ),
    );
  }

  Widget _home() => RefreshIndicator(
    onRefresh: _load,
    child: CustomScrollView(
      key: const PageStorageKey('shop-home-v2'),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.all(20),
          sliver: SliverList.list(
            children: [
              Text(
                'Made with meaning.',
                style: Theme.of(context).textTheme.headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                'Discover the things our community makes.',
                style: TextStyle(color: context.brand.mutedInk),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Search the shop',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _searchController.clear();
                            _search = '';
                            _load();
                          },
                        ),
                ),
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 400), () {
                    _search = v.trim();
                    _load();
                  });
                },
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ActionChip(
                    label: Text(
                      'Filters (${[_category != null, _available, _maker.isNotEmpty, _minimumPrice != null || _maximumPrice != null].where((v) => v).length})',
                    ),
                    avatar: const Icon(Icons.tune),
                    onPressed: _filters,
                  ),
                  DropdownButton<String>(
                    value: _sort == 'priceMinor' && _descending
                        ? 'priceDesc'
                        : _sort,
                    items: const [
                      DropdownMenuItem(
                        value: 'order',
                        child: Text('Recommended'),
                      ),
                      DropdownMenuItem(
                        value: 'createdAt',
                        child: Text('Newest'),
                      ),
                      DropdownMenuItem(
                        value: 'priceMinor',
                        child: Text('Price: low to high'),
                      ),
                      DropdownMenuItem(
                        value: 'priceDesc',
                        child: Text('Price: high to low'),
                      ),
                    ],
                    onChanged: (v) {
                      _sort = v == 'priceDesc' ? 'priceMinor' : v!;
                      _descending = v == 'priceDesc' || v == 'createdAt';
                      _load();
                    },
                  ),
                  FilterChip(
                    label: const Text('Available'),
                    selected: _available,
                    onSelected: (v) {
                      _available = v;
                      _load();
                    },
                  ),
                  if (_category != null)
                    InputChip(
                      label: Text(_category!),
                      onDeleted: () {
                        _category = null;
                        _load();
                      },
                    ),
                ],
              ),
              if (_error != null)
                _state(
                  Icons.cloud_off_outlined,
                  'Could not load the shop',
                  _error!,
                  retry: _load,
                ),
              if (_busy)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator()),
                ),
              if (!_busy && _products.isEmpty && _error == null)
                _state(
                  Icons.storefront_outlined,
                  'Nothing here yet',
                  _search.isEmpty
                      ? 'Products will appear when the store publishes them.'
                      : 'Try another search or clear your filters.',
                ),
            ],
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          sliver: SliverLayoutBuilder(
            builder: (context, constraints) => SliverGrid.builder(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: constraints.crossAxisExtent >= 700 ? 3 : 2,
                mainAxisExtent:
                    322 + (MediaQuery.textScalerOf(context).scale(14) - 14) * 6,
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
              ),
              itemCount: _products.length,
              itemBuilder: (context, index) {
                final p = _products[index];
                return _ProductTile(
                  product: p,
                  saved: _saved.any((s) => s['id'] == p['id']),
                  onOpen: () => _openProduct(p),
                  onSave: () => _save(p),
                );
              },
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(20),
          sliver: SliverList.list(
            children: [
              if (_cursor != null)
                OutlinedButton(
                  onPressed: _loadingMore ? null : () => _load(more: true),
                  child: Text(_loadingMore ? 'Loading…' : 'Load more'),
                ),
              if (_recent.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'Recently viewed',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                ..._recent
                    .take(4)
                    .map(
                      (p) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: SizedBox(
                          width: 52,
                          height: 52,
                          child: ShopImage(
                            url: p['imageUrl'] ?? '',
                            alt: p['name'] ?? '',
                          ),
                        ),
                        title: Text(p['name'] ?? ''),
                        subtitle: Text(shopPrice(p)),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _openProduct(p),
                      ),
                    ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
  Widget _categories() {
    final categories = shopRows(_config['categories']);
    return ListView(
      key: const PageStorageKey('shop-categories'),
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Find your next discovery',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 20),
        if (categories.isEmpty)
          _state(
            Icons.grid_view,
            'Categories are being prepared',
            'Browse all published products from Home.',
          ),
        ...categories.map(
          (c) => Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(12),
              leading: SizedBox(
                width: 64,
                height: 64,
                child: ShopImage(
                  url: c['imageUrl'] ?? '',
                  alt: c['name'] ?? '',
                ),
              ),
              title: Text(c['name'] ?? ''),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                setState(() {
                  _category = c['name'];
                  _tab = 0;
                });
                _load();
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _cartView() => ListView(
    key: const PageStorageKey('shop-cart'),
    padding: const EdgeInsets.all(20),
    children: [
      if (_cart.isEmpty)
        _state(
          Icons.shopping_bag_outlined,
          'Your cart is waiting',
          'Find something you love in the shop.',
        ),
      ..._cart.map((line) {
        final p = Map<String, dynamic>.from(line['product'] as Map? ?? {});
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 88,
                      height: 96,
                      child: ShopImage(
                        url: p['imageUrl'] ?? '',
                        alt: p['name'] ?? '',
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            p['name'] ?? line['productId'],
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(shopPrice(p)),
                          Row(
                            children: [
                              IconButton(
                                tooltip: 'Reduce quantity',
                                onPressed: () {
                                  setState(() {
                                    if (line['quantity'] > 1) {
                                      line['quantity']--;
                                    } else {
                                      _cart.remove(line);
                                    }
                                  });
                                  _persist();
                                },
                                icon: const Icon(Icons.remove),
                              ),
                              Text('${line['quantity']}'),
                              IconButton(
                                tooltip: 'Increase quantity',
                                onPressed: line['quantity'] >= 20
                                    ? null
                                    : () {
                                        setState(() => line['quantity']++);
                                        _persist();
                                      },
                                icon: const Icon(Icons.add),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Remove item',
                      onPressed: () {
                        setState(() => _cart.remove(line));
                        _persist();
                      },
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () {
                    _save(p);
                    setState(() => _cart.remove(line));
                    _persist();
                  },
                  child: const Text('Save for later'),
                ),
              ],
            ),
          ),
        );
      }),
      if (_cart.isNotEmpty) ...[
        const SizedBox(height: 20),
        const Text(
          'Prices and stock are confirmed at checkout. Delivery, discounts and configured tax are shown before payment.',
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _config['checkoutReady'] == true ? _checkout : null,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Review checkout'),
        ),
        if (_config['checkoutReady'] != true)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text(
              'Checkout is being configured. Your selections are saved on this device.',
            ),
          ),
      ],
    ],
  );
  Future<void> _showSaved() async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Saved items')),
          body: ListView(
            children: _saved
                .map(
                  (p) => ListTile(
                    title: Text(p['name'] ?? ''),
                    subtitle: Text(shopPrice(p)),
                    onTap: () => _openProduct(p),
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }

  Widget _state(
    IconData icon,
    String title,
    String body, {
    VoidCallback? retry,
  }) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 40),
    child: Column(
      children: [
        Icon(icon, size: 40, color: context.brand.mutedInk),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(body, textAlign: TextAlign.center),
        if (retry != null)
          TextButton(onPressed: retry, child: const Text('Try again')),
      ],
    ),
  );
}

String _friendly(Object e) =>
    e.toString().replaceFirst(RegExp(r'^\[[^\]]+\]\s*'), '');
int? _filterPrice(String text) {
  final value = double.tryParse(text);
  return value == null || !value.isFinite
      ? null
      : (value.clamp(0, 1000000) * 100).round();
}

class ShopImage extends StatelessWidget {
  const ShopImage({required this.url, required this.alt, super.key});
  final String url, alt;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(12),
    child: url.isEmpty
        ? ColoredBox(
            color: context.brand.surfaceMuted,
            child: const Center(child: Icon(Icons.image_outlined)),
          )
        : CachedNetworkImage(
            imageUrl: url,
            memCacheWidth: 800,
            fit: BoxFit.cover,
            imageBuilder: (context, provider) =>
                Image(image: provider, fit: BoxFit.cover, semanticLabel: alt),
            placeholder: (_, _) =>
                ColoredBox(color: context.brand.surfaceMuted),
            errorWidget: (_, _, _) =>
                const Center(child: Icon(Icons.broken_image_outlined)),
          ),
  );
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.saved,
    required this.onOpen,
    required this.onSave,
  });
  final ShopRow product;
  final bool saved;
  final VoidCallback onOpen, onSave;
  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    margin: EdgeInsets.zero,
    child: InkWell(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                ShopImage(
                  url: product['imageUrl'] ?? '',
                  alt:
                      product['gallery'] is List &&
                          (product['gallery'] as List).isNotEmpty
                      ? product['gallery'][0]['alt'] ?? product['name']
                      : product['name'] ?? '',
                ),
                Positioned(
                  right: 4,
                  top: 4,
                  child: IconButton.filledTonal(
                    tooltip: saved ? 'Unsave product' : 'Save product',
                    onPressed: onSave,
                    icon: Icon(saved ? Icons.favorite : Icons.favorite_border),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product['name'] ?? '',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                if ((product['maker'] ?? '').isNotEmpty)
                  Text(
                    product['maker'],
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: context.brand.mutedInk),
                  ),
                const SizedBox(height: 8),
                Text(
                  shopPrice(product),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.tonal(
                    onPressed: onOpen,
                    child: Text(
                      product['priceMode'] == 'quote' ||
                              (product['priceMinor'] ?? 0) <= 0
                          ? 'Ask about this'
                          : 'View item',
                    ),
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
  int _quantity = 1;
  bool _saved = false;
  @override
  void initState() {
    super.initState();
    _p = widget.initial;
    _saved = widget.saved;
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await ref.read(shopRepositoryProvider).map('product', {
        'id': widget.productId,
      });
      if (mounted)
        setState(() {
          _p = p;
          _variant = shopRows(p['variants']).isEmpty ? 'default' : null;
        });
    } on Object catch (e) {
      if (mounted)
        setState(() {
          _p = null;
          _error = _friendly(e);
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final variants = shopRows(p?['variants']);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Product'),
        actions: [
          IconButton(
            tooltip: 'Share product',
            onPressed: () => Share.share(
              'https://indigenworld.com/shop/product/${widget.productId}',
            ),
            icon: const Icon(Icons.share_outlined),
          ),
        ],
      ),
      body: p == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!, textAlign: TextAlign.center),
                    ),
            )
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                SizedBox(
                  height: 320,
                  child: PageView(
                    children:
                        (shopRows(p['gallery']).isEmpty
                                ? [
                                    {'url': p['imageUrl'], 'alt': p['name']},
                                  ]
                                : shopRows(p['gallery']))
                            .map(
                              (a) => GestureDetector(
                                onTap: () => showDialog<void>(
                                  context: context,
                                  builder: (_) => Dialog(
                                    child: InteractiveViewer(
                                      minScale: 1,
                                      maxScale: 5,
                                      child: ShopImage(
                                        url: a['url'] ?? '',
                                        alt: a['alt'] ?? '',
                                      ),
                                    ),
                                  ),
                                ),
                                child: ShopImage(
                                  url: a['url'] ?? '',
                                  alt: a['alt'] ?? '',
                                ),
                              ),
                            )
                            .toList(),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  p['name'] ?? '',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if ((p['maker'] ?? '').isNotEmpty)
                  Text(
                    p['maker'],
                    style: TextStyle(color: context.brand.mutedInk),
                  ),
                const SizedBox(height: 12),
                Text(
                  shopPrice(p),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 20),
                Text(p['description'] ?? p['summary'] ?? ''),
                const SizedBox(height: 20),
                if (variants.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: _variant,
                    decoration: const InputDecoration(
                      labelText: 'Choose a variant',
                    ),
                    items: variants
                        .map(
                          (v) => DropdownMenuItem<String>(
                            value: v['id'],
                            child: Text(
                              '${v['name']} · ${shopMoney(v['priceMinor'] ?? p['priceMinor'])}',
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) => setState(() => _variant = v),
                  ),
                if (p['inStock'] == false)
                  const Text('Currently unavailable')
                else if (p['priceMode'] == 'quote' ||
                    (p['priceMinor'] ?? 0) <= 0)
                  FilledButton(
                    onPressed: _inquiry,
                    child: const Text('Ask for a price'),
                  )
                else ...[
                  Row(
                    children: [
                      IconButton(
                        tooltip: 'Reduce quantity',
                        onPressed: _quantity > 1
                            ? () => setState(() => _quantity--)
                            : null,
                        icon: const Icon(Icons.remove),
                      ),
                      Text('$_quantity'),
                      IconButton(
                        tooltip: 'Increase quantity',
                        onPressed: _quantity < 20
                            ? () => setState(() => _quantity++)
                            : null,
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
                  FilledButton(
                    onPressed: _variant == null
                        ? null
                        : () async {
                            if (widget.onAdd != null) {
                              widget.onAdd!(p, _variant!, _quantity);
                              Navigator.pop(context);
                            } else {
                              final account =
                                  ref
                                      .read(firebaseAuthProvider)
                                      ?.currentUser
                                      ?.uid ??
                                  'guest';
                              final store = ShopLocalStore(account),
                                  data = await store.read();
                              final lines = shopRows(data['cart']);
                              final selectedLine = <String, dynamic>{
                                'productId': p['id'],
                                'variantId': _variant,
                                'quantity': _quantity,
                                'product': p,
                              };
                              final existing = lines.indexWhere(
                                (line) =>
                                    cartKey(line) == cartKey(selectedLine),
                              );
                              if (existing >= 0) {
                                lines[existing]['quantity'] =
                                    ((lines[existing]['quantity'] as num) +
                                            _quantity)
                                        .clamp(1, 20);
                              } else {
                                lines.add(selectedLine);
                              }
                              await store.write({...data, 'cart': lines});
                              if (account != 'guest')
                                await ref.read(shopRepositoryProvider).map(
                                  'saveCart',
                                  {'lines': lines},
                                );
                              if (context.mounted)
                                Navigator.pushReplacement(
                                  context,
                                  MaterialPageRoute<void>(
                                    builder: (_) => const ShopCollectionScreen(
                                      initialTab: 2,
                                    ),
                                  ),
                                );
                            }
                          },
                    child: const Text('Add to cart'),
                  ),
                  OutlinedButton(
                    onPressed: _variant == null
                        ? null
                        : () async {
                            if (ref.read(firebaseAuthProvider)?.currentUser ==
                                    null &&
                                await showSignInSheet(context) != true)
                              return;
                            try {
                              final config = await ref
                                  .read(shopRepositoryProvider)
                                  .map('config');
                              if (!mounted) return;
                              if (config['checkoutReady'] != true) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Checkout is being configured. Save this item and check back.',
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
                              if (mounted)
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text(_friendly(e))),
                                );
                            }
                          },
                    child: const Text('Buy now'),
                  ),
                ],
                if (widget.onSave != null)
                  TextButton.icon(
                    onPressed: () {
                      widget.onSave!();
                      setState(() => _saved = !_saved);
                    },
                    icon: Icon(_saved ? Icons.favorite : Icons.favorite_border),
                    label: Text(_saved ? 'Saved' : 'Save for later'),
                  ),
                const Text(
                  'Delivery options and any applicable costs are confirmed before payment.',
                ),
              ],
            ),
    );
  }

  Future<void> _inquiry() async {
    if (ref.read(firebaseAuthProvider)?.currentUser == null &&
        await showSignInSheet(context) != true)
      return;
    if (!mounted) return;
    final contact = TextEditingController(), message = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Ask about this item'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: contact,
                decoration: const InputDecoration(
                  labelText: 'How can the store reach you?',
                ),
              ),
              TextField(
                controller: message,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Your question'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              try {
                await ref.read(shopRepositoryProvider).call('inquiry', {
                  'productId': widget.productId,
                  'requestId':
                      'inquiry-${DateTime.now().microsecondsSinceEpoch}',
                  'contact': contact.text,
                  'message': message.text,
                });
                if (dialog.mounted) Navigator.pop(dialog);
              } on Object catch (e) {
                if (dialog.mounted)
                  ScaffoldMessenger.of(context)
                      .showSnackBar(SnackBar(content: Text(_friendly(e))));
              }
            },
            child: const Text('Send inquiry'),
          ),
        ],
      ),
    );
    contact.dispose();
    message.dispose();
  }
}
