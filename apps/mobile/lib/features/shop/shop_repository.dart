import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

typedef ShopRow = Map<String, dynamic>;

class ShopRepository {
  Future<dynamic> call(String operation, [ShopRow data = const {}]) async =>
      (await FirebaseFunctions.instance.httpsCallable('shop').call<dynamic>({
        'operation': operation,
        ...data,
      })).data;
  Future<ShopRow> map(String operation, [ShopRow data = const {}]) async =>
      Map<String, dynamic>.from(await call(operation, data) as Map);
}

final shopRepositoryProvider = Provider((ref) => ShopRepository());
String shopMoney(dynamic minor, [dynamic currency = 'GHS']) =>
    '$currency ${((minor as num? ?? 0) / 100).toStringAsFixed(2)}';
String shopPrice(ShopRow p) =>
    p['priceMode'] == 'quote' || (p['priceMinor'] as num? ?? 0) <= 0
    ? 'Ask for a price'
    : shopMoney(p['priceMinor'], p['currency']);
List<ShopRow> shopRows(dynamic value) => (value is List ? value : [])
    .whereType<Map>()
    .map((e) => Map<String, dynamic>.from(e))
    .toList();
String cartKey(ShopRow row) =>
    '${row['productId']}__${row['variantId'] ?? 'default'}';

/// Persistent selections only. Checkout always reloads prices/stock on the server.
class ShopLocalStore {
  ShopLocalStore(this.account);
  final String account;
  String get key => 'indigen.shop.v2.$account';
  Future<ShopRow> read() async {
    final raw = (await SharedPreferences.getInstance()).getString(key);
    if (raw == null) return {};
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } on Object {
      return {};
    }
  }

  Future<void> write(ShopRow data) async {
    await (await SharedPreferences.getInstance()).setString(
      key,
      jsonEncode(data),
    );
  }

  Future<String> mergeKey() async {
    final prefs = await SharedPreferences.getInstance(),
        nonceKey = '$key.mergeNonce';
    final existing = prefs.getString(nonceKey);
    if (existing != null) return existing;
    final nonce = 'guest-${DateTime.now().microsecondsSinceEpoch}';
    await prefs.setString(nonceKey, nonce);
    return nonce;
  }

  Future<void> finishMerge() async {
    final data = await read();
    await write({...data, 'cart': <ShopRow>[]});
    await (await SharedPreferences.getInstance()).remove('$key.mergeNonce');
  }
}
