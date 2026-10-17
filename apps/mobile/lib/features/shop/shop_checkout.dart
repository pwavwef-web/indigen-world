import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';

import 'package:indigen_world_mobile/features/shop/shop_repository.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/channel_stage.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

import 'package:indigen_world_mobile/features/shop/shop_screen.dart'
    show ShopCollectionScreen;

class ShopCheckoutScreen extends ConsumerStatefulWidget {
  const ShopCheckoutScreen({
    required this.lines,
    required this.config,
    super.key,
  });
  final List<ShopRow> lines;
  final ShopRow config;
  @override
  ConsumerState<ShopCheckoutScreen> createState() => _ShopCheckoutScreenState();
}

class _ShopCheckoutScreenState extends ConsumerState<ShopCheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _fields = {
    for (final f in [
      'recipient',
      'country',
      'region',
      'city',
      'street',
      'phone',
      'digitalAddress',
      'instructions',
    ])
      f: TextEditingController(),
  };
  final _coupon = TextEditingController();
  final _requestId = 'checkout-${DateTime.now().microsecondsSinceEpoch}';
  String? _delivery, _error;
  bool _busy = false;
  int _step = 0;
  ShopRow? _order;
  List<ShopRow> _addresses = [];
  String? _addressId;
  @override
  void initState() {
    super.initState();
    _loadAddresses();
  }

  void _applyAddress(ShopRow address) {
    for (final e in _fields.entries) {
      e.value.text = '${address[e.key] ?? ''}';
    }
  }

  Future<void> _loadAddresses() async {
    try {
      final result = await ref.read(shopRepositoryProvider).map('profile');
      if (!mounted) return;
      setState(() {
        _addresses = shopRows(result['addresses']);
        _addressId = result['profile']?['defaultShippingId'] as String?;
        final matches = _addresses.where((a) => a['id'] == _addressId);
        if (matches.isNotEmpty) _applyAddress(matches.first);
      });
    } on Object {
      /* address entry remains available */
    }
  }

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    _coupon.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final delivery = shopRows(widget.config['delivery']);
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              [
                'Contact & address',
                'Delivery or pickup',
                'Review your order',
              ][_step],
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text('Step ${_step + 1} of 3'),
            const SizedBox(height: 24),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (_step == 0 && _addresses.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: _addresses.any((a) => a['id'] == _addressId)
                    ? _addressId
                    : null,
                decoration: const InputDecoration(
                  labelText: 'Use a saved address',
                ),
                items: _addresses
                    .map(
                      (a) => DropdownMenuItem<String>(
                        value: a['id'],
                        child: Text(
                          '${a['label'] ?? a['recipient']} · ${a['city']}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  setState(() {
                    _addressId = value;
                    _applyAddress(
                      _addresses.firstWhere((a) => a['id'] == value),
                    );
                  });
                },
              ),
            if (_step == 0)
              Form(
                key: _form,
                child: Column(
                  children: [
                    for (final entry in _fields.entries)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: TextFormField(
                          controller: entry.value,
                          maxLines: entry.key == 'instructions' ? 3 : 1,
                          textCapitalization: entry.key == 'country'
                              ? TextCapitalization.characters
                              : TextCapitalization.words,
                          keyboardType: entry.key == 'phone'
                              ? TextInputType.phone
                              : TextInputType.text,
                          decoration: InputDecoration(
                            labelText:
                                {
                                  'country': 'Country (2-letter code, e.g. GH)',
                                  'city': 'City / town',
                                  'street': 'Street / landmark',
                                  'digitalAddress':
                                      'Digital address (optional)',
                                  'instructions':
                                      'Delivery instructions (optional)',
                                }[entry.key] ??
                                entry.key[0].toUpperCase() +
                                    entry.key.substring(1),
                          ),
                          validator: (v) =>
                              ![
                                    'digitalAddress',
                                    'instructions',
                                    'region',
                                  ].contains(entry.key) &&
                                  (v?.trim().isEmpty ?? true)
                              ? 'This field is required'
                              : entry.key == 'country' &&
                                    !RegExp(r'^[A-Za-z]{2}$').hasMatch(v ?? '')
                              ? 'Use a 2-letter country code'
                              : null,
                        ),
                      ),
                    FilledButton(
                      onPressed: () {
                        if (_form.currentState!.validate())
                          setState(() => _step = 1);
                      },
                      child: const Text('Continue to delivery'),
                    ),
                  ],
                ),
              ),
            if (_step == 1) ...[
              if (delivery.isEmpty)
                const Text(
                  'No delivery options are available. Contact the store; your cart is saved.',
                ),
              ...delivery.map(
                (d) => RadioListTile<String>(
                  value: d['id'],
                  groupValue: _delivery,
                  onChanged: _busy
                      ? null
                      : (v) => setState(() => _delivery = v),
                  title: Text(d['name'] ?? ''),
                  subtitle: Text(
                    '${shopMoney(d['feeMinor'])}${(d['estimate'] ?? '').isEmpty ? '' : ' · ${d['estimate']}'}',
                  ),
                ),
              ),
              TextField(
                controller: _coupon,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Promotion code (optional)',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _delivery == null || _busy ? null : _review,
                child: Text(
                  _busy ? 'Checking stock & prices…' : 'Review final total',
                ),
              ),
              TextButton(
                onPressed: _busy ? null : () => setState(() => _step = 0),
                child: const Text('Edit address'),
              ),
            ],
            if (_step == 2 && _order != null) ...[
              ...shopRows(_order!['items']).map(
                (item) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${item['quantity']} × ${item['name']}'),
                  subtitle: Text(item['variant'] ?? ''),
                  trailing: Text(
                    shopMoney(
                      (item['priceMinor'] as num) * (item['quantity'] as num),
                    ),
                  ),
                ),
              ),
              const Divider(),
              for (final field in [
                'subtotalMinor',
                'discountMinor',
                'deliveryMinor',
                'taxMinor',
                'totalMinor',
              ])
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    {
                      'subtotalMinor': 'Subtotal',
                      'discountMinor': 'Discount',
                      'deliveryMinor': 'Delivery',
                      'taxMinor': 'Tax',
                      'totalMinor': 'Total',
                    }[field]!,
                  ),
                  trailing: Text(
                    shopMoney(_order![field]),
                    style: TextStyle(
                      fontWeight: field == 'totalMinor'
                          ? FontWeight.bold
                          : FontWeight.normal,
                    ),
                  ),
                ),
              const SizedBox(height: 20),
              const Text(
                'Payment is collected securely on the provider’s hosted page. Returning here does not confirm payment; we verify the provider’s record.',
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () async {
                        await Navigator.pushReplacement(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => ShopOrderScreen(
                              orderId: _order!['id'],
                              initial: _order,
                            ),
                          ),
                        );
                      },
                child: const Text('Continue to payment'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _review() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await ref.read(shopRepositoryProvider).map('checkout', {
        'requestId': _requestId,
        'lines': widget.lines,
        'address': {
          for (final e in _fields.entries)
            e.key: e.key == 'country'
                ? e.value.text.toUpperCase().trim()
                : e.value.text.trim(),
        },
        'deliveryId': _delivery,
        'coupon': _coupon.text.trim(),
      });
      if (mounted)
        setState(() {
          _order = order;
          _step = 2;
        });
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class ShopOrderScreen extends ConsumerStatefulWidget {
  const ShopOrderScreen({required this.orderId, this.initial, super.key});
  final String orderId;
  final ShopRow? initial;
  @override
  ConsumerState<ShopOrderScreen> createState() => _ShopOrderScreenState();
}

class _ShopOrderScreenState extends ConsumerState<ShopOrderScreen>
    with WidgetsBindingObserver {
  final _reorderKey = 'reorder-${DateTime.now().microsecondsSinceEpoch}';
  ShopRow? _order;
  String? _error;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _order = widget.initial;
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh(verify: true);
  }

  Future<void> _refresh({bool verify = false}) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (ref.read(firebaseAuthProvider)?.currentUser == null) {
        if (await showSignInSheet(context) != true) return;
      }
      final order = await ref.read(shopRepositoryProvider).map(
        verify ? 'verifyPayment' : 'order',
        {'id': widget.orderId},
      );
      if (mounted) setState(() => _order = order);
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _order;
    return Scaffold(
      appBar: AppBar(title: const Text('Your order')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_error != null)
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (o == null) ...[
              if (_busy) const Center(child: CircularProgressIndicator()),
              TextButton(onPressed: _refresh, child: const Text('Load order')),
            ] else ...[
              Icon(
                o['paymentStatus'] == 'paid'
                    ? Icons.check_circle_outline
                    : Icons.receipt_long_outlined,
                size: 48,
              ),
              const SizedBox(height: 16),
              Text(
                o['paymentStatus'] == 'paid'
                    ? 'Payment confirmed'
                    : 'Order saved',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              SelectableText('Order ${o['id']}'),
              const SizedBox(height: 16),
              Text('Payment: ${o['paymentStatus']}'),
              Text('Fulfillment: ${o['fulfillmentStatus']}'),
              for (final entry in {
                'Subtotal': 'subtotalMinor',
                'Delivery': 'deliveryMinor',
                'Discount': 'discountMinor',
                'Tax': 'taxMinor',
              }.entries)
                if (o[entry.value] != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Text(
                      '${entry.key}: ${shopMoney(o[entry.value], o['currency'])}',
                    ),
                  ),
              if (o['paymentStatus'] == 'refund_required')
                const Text(
                  'Payment was received after stock became unavailable. The store needs to resolve a refund; fulfillment is blocked.',
                ),
              ...shopRows(o['items']).map(
                (item) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${item['quantity']} × ${item['name']}'),
                  subtitle: Text(item['variant'] ?? ''),
                  trailing: Text(shopMoney(item['priceMinor'])),
                ),
              ),
              const Divider(),
              Text(
                'Total ${shopMoney(o['totalMinor'], o['currency'])}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              if ((o['refundedMinor'] ?? 0) > 0)
                Text('Refunded ${shopMoney(o['refundedMinor'])}'),
              const SizedBox(height: 20),
              if (![
                    'paid',
                    'refund_required',
                    'refunded',
                  ].contains(o['paymentStatus']) &&
                  o['reservationState'] == 'held')
                FilledButton(
                  onPressed: _busy ? null : _pay,
                  child: Text(_busy ? 'Please wait…' : 'Open hosted payment'),
                ),
              if (o['reservationState'] == 'expired' &&
                  o['paymentStatus'] != 'paid')
                const Text(
                  'The stock reservation expired. If you already paid, check payment status. Otherwise create a new checkout to confirm current availability.',
                ),
              OutlinedButton(
                onPressed: _busy ? null : () => _refresh(verify: true),
                child: const Text('Check payment status'),
              ),
              const SizedBox(height: 20),
              Text(
                'Order timeline',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              ...shopRows(o['timeline']).map(
                (event) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.check_circle_outline),
                  title: Text(event['event'] ?? ''),
                  subtitle: Text(event['at'] ?? ''),
                ),
              ),
              if ((o['tracking'] ?? '').isNotEmpty)
                SelectableText(
                  'Tracking: ${o['carrier'] ?? ''} ${o['tracking']}',
                ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                children: [
                  TextButton.icon(
                    onPressed: () => Share.share(
                      'Order ${o['id']}\nPayment: ${o['paymentStatus']}\nFulfillment: ${o['fulfillmentStatus']}\n${shopRows(o['items']).map((i) => '${i['quantity']} × ${i['name']} · ${shopMoney(i['priceMinor'], o['currency'])}').join('\n')}\nTotal ${shopMoney(o['totalMinor'], o['currency'])}\nRefunded ${shopMoney(o['refundedMinor'] ?? 0, o['currency'])}',
                    ),
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: const Text('Share order record'),
                  ),
                  TextButton.icon(
                    onPressed: _busy
                        ? null
                        : () async {
                            setState(() => _busy = true);
                            try {
                              await ref.read(shopRepositoryProvider).map(
                                'mergeCart',
                                {
                                  'mergeKey': _reorderKey,
                                  'lines': shopRows(o['items'])
                                      .map(
                                        (i) => {
                                          'productId': i['productId'],
                                          'variantId': i['variantId'],
                                          'quantity': i['quantity'],
                                        },
                                      )
                                      .toList(),
                                },
                              );
                              if (context.mounted)
                                await Navigator.push(
                                  context,
                                  MaterialPageRoute<void>(
                                    builder: (_) => const ShopCollectionScreen(
                                      initialTab: 2,
                                    ),
                                  ),
                                );
                            } on Object catch (e) {
                              if (mounted) setState(() => _error = '$e');
                            } finally {
                              if (mounted) setState(() => _busy = false);
                            }
                          },
                    icon: const Icon(Icons.replay),
                    label: const Text('Reorder & review prices'),
                  ),
                  for (final kind in ['cancellation', 'return', 'support'])
                    TextButton(
                      onPressed: () => _request(kind),
                      child: Text(
                        {
                          'cancellation': 'Request cancellation',
                          'return': 'Request a return',
                          'support': 'Order support',
                        }[kind]!,
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref.read(shopRepositoryProvider).map(
        'startPayment',
        {'id': widget.orderId},
      );
      final uri = Uri.tryParse(result['authorizationUrl'] ?? '');
      if (uri == null ||
          uri.scheme != 'https' ||
          !(uri.host == 'checkout.paystack.com' ||
              uri.host.endsWith('.paystack.com')))
        throw StateError('Payment URL is unavailable. Check payment status.');
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication))
        throw StateError('Could not open the payment page.');
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request(String kind) async {
    final controller = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Order $kind'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'How can the store help?',
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
                await ref.read(shopRepositoryProvider).call('orderRequest', {
                  'id': widget.orderId,
                  'kind': kind,
                  'message': controller.text,
                  'requestId':
                      'request-${DateTime.now().microsecondsSinceEpoch}',
                });
                if (dialog.mounted) Navigator.pop(dialog);
              } on Object catch (e) {
                if (mounted) setState(() => _error = '$e');
              }
            },
            child: const Text('Submit request'),
          ),
        ],
      ),
    );
    controller.dispose();
  }
}

class ShopProfileScreen extends ConsumerStatefulWidget {
  const ShopProfileScreen({
    required this.config,
    this.scrollController,
    this.savedCount = 0,
    this.onOpenSaved,
    super.key,
  });
  final ShopRow config;
  final ScrollController? scrollController;
  final int savedCount;
  final VoidCallback? onOpenSaved;
  @override
  ConsumerState<ShopProfileScreen> createState() => _ShopProfileScreenState();
}

class _ShopProfileScreenState extends ConsumerState<ShopProfileScreen> {
  ShopRow _profile = {};
  String? _error;
  String? _uid;
  bool _busy = false;
  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final p = await ref.read(shopRepositoryProvider).map('profile');
      if (mounted) {
        setState(() {
          _profile = p;
          _error = null;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final user = ref.watch(authStateProvider).asData?.value;
    if (_uid != user?.uid) {
      _uid = user?.uid;
      _profile = {};
      if (_uid != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _load());
      }
    }
    final s = Map<String, dynamic>.from(
      widget.config['settings'] as Map? ?? {},
    );
    final orders = shopRows(_profile['orders']);
    final addresses = shopRows(_profile['addresses']);
    final methods = shopRows(_profile['paymentMethods']);
    final name = (user?.displayName ?? '').trim();
    return RefreshIndicator(
      onRefresh: user == null ? () async {} : _load,
      edgeOffset: MediaQuery.paddingOf(context).top + 100,
      child: CustomScrollView(
        key: const PageStorageKey('shop-profile'),
        controller: widget.scrollController,
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: ChannelStageDelegate(
              eyebrow: 'Shop profile',
              title: user == null
                  ? 'Your account'
                  : name.isEmpty
                  ? 'Your orders'
                  : name,
              subtitle: user == null
                  ? 'Your Indigen World sign-in. No separate shop login.'
                  : user.email,
              topPadding: MediaQuery.paddingOf(context).top,
              textScale: MediaQuery.textScalerOf(
                context,
              ).scale(1).clamp(1, 1.4),
              stageHeight: 96,
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverList.list(
              children: [
                if (user == null)
                  _ProfileCard(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Sign in to see your orders and addresses.',
                              style: TextStyle(
                                color: brand.ink,
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Anything in your cart stays on this device and joins your account when you sign in.',
                              style: TextStyle(
                                color: brand.mutedInk,
                                height: 1.4,
                              ),
                            ),
                            const SizedBox(height: 14),
                            FilledButton(
                              onPressed: () => showSignInSheet(context),
                              child: const Text('Sign in'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  )
                else ...[
                  if (_busy) const LinearProgressIndicator(minHeight: 2),
                  if (_error != null)
                    _ProfileCard(
                      children: [
                        ListTile(
                          leading: Icon(
                            Icons.cloud_off_rounded,
                            color: brand.danger,
                          ),
                          title: const Text('Could not load your shop profile'),
                          subtitle: const Text('Pull down to try again.'),
                        ),
                      ],
                    ),
                  Row(
                    children: [
                      _StatTile(
                        icon: Icons.inventory_2_outlined,
                        value: '${orders.length}',
                        label: orders.length == 1 ? 'Order' : 'Orders',
                      ),
                      const SizedBox(width: 10),
                      _StatTile(
                        icon: Icons.favorite_border_rounded,
                        value: '${widget.savedCount}',
                        label: 'Saved',
                        onTap: widget.onOpenSaved,
                      ),
                      const SizedBox(width: 10),
                      _StatTile(
                        icon: Icons.location_on_outlined,
                        value: '${addresses.length}',
                        label: addresses.length == 1 ? 'Address' : 'Addresses',
                      ),
                    ],
                  ),
                  const _ProfileHeading('Orders'),
                  _ProfileCard(
                    children: [
                      if (orders.isEmpty)
                        ListTile(
                          leading: Icon(
                            Icons.receipt_long_outlined,
                            color: brand.mutedInk,
                          ),
                          title: const Text('No orders yet'),
                          subtitle: const Text(
                            'Orders you place appear here with their status.',
                          ),
                        ),
                      for (final o in orders)
                        ListTile(
                          leading: const _RoundIcon(Icons.inventory_2_outlined),
                          title: Text(
                            shopMoney(o['totalMinor'], o['currency'] ?? 'GHS'),
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                _StatusChip(
                                  (o['paymentStatus'] ?? 'pending').toString(),
                                ),
                                _StatusChip(
                                  (o['fulfillmentStatus'] ?? 'unfulfilled')
                                      .toString(),
                                ),
                              ],
                            ),
                          ),
                          trailing: const Icon(Icons.chevron_right_rounded),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  ShopOrderScreen(orderId: o['id'], initial: o),
                            ),
                          ),
                        ),
                    ],
                  ),
                  _ProfileHeading(
                    'Addresses',
                    action: 'Add',
                    onAction: _address,
                  ),
                  _ProfileCard(
                    children: [
                      if (addresses.isEmpty)
                        ListTile(
                          leading: const _RoundIcon(
                            Icons.add_location_alt_outlined,
                          ),
                          title: const Text('Add a delivery address'),
                          subtitle: const Text(
                            'Region, town and a landmark. A GhanaPost GPS code is optional.',
                          ),
                          onTap: _address,
                        ),
                      for (final a in addresses)
                        ListTile(
                          leading: const _RoundIcon(Icons.location_on_outlined),
                          title: Text(
                            a['label']?.isNotEmpty == true
                                ? a['label']
                                : a['recipient'] ?? 'Address',
                          ),
                          subtitle: Text(
                            [a['street'], a['city'], a['region'], a['country']]
                                .where((v) => (v ?? '').toString().isNotEmpty)
                                .join(', '),
                          ),
                          onTap: () => _address(a),
                          trailing: IconButton(
                            tooltip: 'Delete address',
                            onPressed: () async {
                              try {
                                await ref
                                    .read(shopRepositoryProvider)
                                    .call('deleteAddress', {'id': a['id']});
                                await _load();
                              } on Object catch (e) {
                                if (mounted) setState(() => _error = '$e');
                              }
                            },
                            icon: const Icon(Icons.delete_outline_rounded),
                          ),
                        ),
                    ],
                  ),
                  const _ProfileHeading('Payment'),
                  _ProfileCard(
                    children: [
                      for (final method in methods)
                        ListTile(
                          leading: const _RoundIcon(Icons.credit_card_rounded),
                          title: Text(
                            '${method['brand']} •••• ${method['last4']}',
                          ),
                          subtitle: Text(
                            'Expires ${method['expMonth']}/${method['expYear']}',
                          ),
                          trailing: PopupMenuButton<String>(
                            tooltip: 'Card options',
                            onSelected: (value) async {
                              try {
                                await ref
                                    .read(shopRepositoryProvider)
                                    .call('paymentMethod', {
                                      'id': method['id'],
                                      'remove': value == 'remove',
                                    });
                                await _load();
                              } on Object catch (e) {
                                if (mounted) setState(() => _error = '$e');
                              }
                            },
                            itemBuilder: (_) => const [
                              PopupMenuItem(
                                value: 'default',
                                child: Text('Make default'),
                              ),
                              PopupMenuItem(
                                value: 'remove',
                                child: Text('Remove'),
                              ),
                            ],
                          ),
                        ),
                      ListTile(
                        leading: const _RoundIcon(Icons.lock_outline_rounded),
                        title: Text(
                          methods.isEmpty
                              ? 'No saved cards'
                              : 'How cards are kept',
                        ),
                        subtitle: const Text(
                          'Card details are entered on the payment provider’s secure page. Only a masked reference is kept here.',
                        ),
                      ),
                      ListTile(
                        leading: const _RoundIcon(Icons.phone_android_rounded),
                        title: const Text('Mobile money & contact'),
                        subtitle: const Text(
                          'A saved number is a preference, not permission to charge it.',
                        ),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: _preferences,
                      ),
                    ],
                  ),
                ],
                if ((s['deliveryPolicy'] ?? '').isNotEmpty ||
                    (s['returnsPolicy'] ?? '').isNotEmpty ||
                    (s['supportEmail'] ?? '').isNotEmpty) ...[
                  const _ProfileHeading('Help'),
                  _ProfileCard(
                    children: [
                      for (final field in ['deliveryPolicy', 'returnsPolicy'])
                        if ((s[field] ?? '').isNotEmpty)
                          ExpansionTile(
                            leading: _RoundIcon(
                              field == 'deliveryPolicy'
                                  ? Icons.local_shipping_outlined
                                  : Icons.assignment_return_outlined,
                            ),
                            shape: const Border(),
                            collapsedShape: const Border(),
                            title: Text(
                              field == 'deliveryPolicy'
                                  ? 'Delivery policy'
                                  : 'Returns policy',
                            ),
                            childrenPadding: const EdgeInsets.fromLTRB(
                              16,
                              0,
                              16,
                              16,
                            ),
                            children: [Text(s[field])],
                          ),
                      if ((s['supportEmail'] ?? '').isNotEmpty)
                        ListTile(
                          leading: const _RoundIcon(
                            Icons.support_agent_rounded,
                          ),
                          title: const Text('Store support'),
                          subtitle: Text(s['supportEmail']),
                          onTap: () => launchUrl(
                            Uri(scheme: 'mailto', path: s['supportEmail']),
                          ),
                        ),
                    ],
                  ),
                ],
                SizedBox(height: shellBottomReserve(context) + 12),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _preferences() async {
    final profile = Map<String, dynamic>.from(
          _profile['profile'] as Map? ?? {},
        ),
        phone = TextEditingController(
          text: _profile['profile']?['mobileMoneyPhone'] ?? '',
        );
    var promotional = profile['promotionalContact'] == true;
    String? error;
    await showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (context, state) => AlertDialog(
          title: const Text('Store preferences'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Preferred mobile money number (optional)',
                ),
              ),
              SwitchListTile(
                value: promotional,
                onChanged: (v) => state(() => promotional = v),
                title: const Text('Optional store contact'),
              ),
              if (error != null) Text(error!),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                try {
                  await ref.read(shopRepositoryProvider).call(
                    'savePreferences',
                    {
                      'mobileMoneyPhone': phone.text.trim(),
                      'promotionalContact': promotional,
                    },
                  );
                  if (dialog.mounted) Navigator.pop(dialog);
                  await _load();
                } on Object catch (e) {
                  state(() => error = '$e');
                }
              },
              child: const Text('Save preferences'),
            ),
          ],
        ),
      ),
    );
    phone.dispose();
  }

  Future<void> _address([ShopRow? address]) async {
    final fields = {
      for (final f in [
        'label',
        'recipient',
        'country',
        'region',
        'city',
        'street',
        'phone',
        'digitalAddress',
        'instructions',
      ])
        f: TextEditingController(text: address?[f] ?? ''),
    };
    var defaultShipping = false, defaultBilling = false;
    String? error;
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (context, state) => AlertDialog(
          title: Text(address == null ? 'Add address' : 'Edit address'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final e in fields.entries)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: TextField(
                        controller: e.value,
                        decoration: InputDecoration(
                          labelText: e.key == 'country'
                              ? 'Country (2-letter code)'
                              : e.key,
                        ),
                      ),
                    ),
                  CheckboxListTile(
                    value: defaultShipping,
                    onChanged: (v) => state(() => defaultShipping = v!),
                    title: const Text('Default shipping'),
                  ),
                  CheckboxListTile(
                    value: defaultBilling,
                    onChanged: (v) => state(() => defaultBilling = v!),
                    title: const Text('Default billing'),
                  ),
                  if (error != null) Text(error!),
                ],
              ),
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
                  await ref.read(shopRepositoryProvider).call('saveAddress', {
                    'id': address?['id'],
                    'address': {
                      for (final e in fields.entries)
                        e.key: e.key == 'country'
                            ? e.value.text.toUpperCase()
                            : e.value.text,
                    },
                    'defaultShipping': defaultShipping,
                    'defaultBilling': defaultBilling,
                  });
                  if (dialog.mounted) Navigator.pop(dialog);
                  await _load();
                } on Object catch (e) {
                  state(() => error = '$e');
                }
              },
              child: const Text('Save address'),
            ),
          ],
        ),
      ),
    );
    for (final c in fields.values) {
      c.dispose();
    }
  }
}

class _ProfileHeading extends StatelessWidget {
  const _ProfileHeading(this.title, {this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => ChannelSectionHeader(
    title: title,
    action: action,
    onAction: onAction,
    padding: const EdgeInsets.fromLTRB(4, 22, 0, 8),
  );
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Material(
      color: brand.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: brand.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 68, color: brand.divider),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon(this.icon);
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    width: 38,
    height: 38,
    decoration: BoxDecoration(
      color: context.brand.accentSoft,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Icon(icon, size: 19, color: context.brand.accent),
  );
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
    this.onTap,
  });
  final IconData icon;
  final String value, label;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Expanded(
      child: Semantics(
        button: onTap != null,
        label: '$value $label',
        excludeSemantics: true,
        child: Material(
          color: brand.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: BorderSide(color: brand.border),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 18, color: brand.accent),
                  const SizedBox(height: 8),
                  Text(
                    value,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: brand.mutedInk, fontSize: 12),
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

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;
  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final color = switch (status) {
      'paid' || 'delivered' || 'fulfilled' => brand.success,
      'failed' || 'cancelled' || 'refunded' => brand.danger,
      'dispatched' || 'packing' => brand.accent,
      _ => brand.mutedInk,
    };
    final label = status.isEmpty
        ? ''
        : status[0].toUpperCase() + status.substring(1).replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
