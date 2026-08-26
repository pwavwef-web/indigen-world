import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';

/// The two admin-curated catalogues behind Collection's Apps and Shop cards.
///
/// Apps are links out — Kasem apps, scripture apps, other Indigen World
/// releases — and the Shop is the physical side of the project: souvenirs,
/// books, shea butter.
///
/// No money moves through the app. A member sends an order *request* and
/// somebody answers it, which is why [ShopOrderDraft] carries a way to reach
/// them rather than a card. That is a deliberate limit: taking payment would
/// pull card handling, refunds and chargebacks into what is otherwise a
/// cultural archive, for volumes that do not need any of it.

/// One entry in the app directory.
@immutable
class DirectoryApp {
  const DirectoryApp({
    required this.id,
    required this.name,
    this.developer = '',
    this.description = '',
    this.category = '',
    this.iconUrl = '',
    this.links = const <String, String>{},
  });

  final String id;
  final String name;
  final String developer;
  final String description;
  final String category;
  final String iconUrl;

  /// Store links keyed by platform: `android`, `ios`, `web`.
  final Map<String, String> links;

  /// The link to open on this device, preferring the native store.
  ///
  /// Android first because that is what the overwhelming majority of members
  /// carry; the web link is the catch-all for an app with no store presence.
  String? get primaryLink {
    for (final platform in const ['android', 'ios', 'web']) {
      final link = links[platform];
      if (link != null && link.isNotEmpty) return link;
    }
    return null;
  }

  static DirectoryApp fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    final rawLinks = data['links'];
    final links = <String, String>{};
    if (rawLinks is Map) {
      rawLinks.forEach((key, value) {
        if (key is String && value is String && value.trim().isNotEmpty) {
          links[key] = value.trim();
        }
      });
    }
    return DirectoryApp(
      id: doc.id,
      name: _text(data['name'], fallback: 'App'),
      developer: _text(data['developer']),
      description: _text(data['description']),
      category: _text(data['category']),
      iconUrl: _text(data['iconUrl']),
      links: links,
    );
  }
}

/// One thing the shop sells.
@immutable
class ShopProduct {
  const ShopProduct({
    required this.id,
    required this.name,
    this.summary = '',
    this.description = '',
    this.category = '',
    this.priceMinor = 0,
    this.currency = 'GHS',
    this.imageUrl = '',
    this.maker = '',
    this.inStock = true,
  });

  final String id;
  final String name;
  final String summary;
  final String description;
  final String category;

  /// Minor units — pesewas — so a price is never a floating-point number.
  final int priceMinor;
  final String currency;

  final String imageUrl;
  final String maker;
  final bool inStock;

  /// Zero is "ask us", not free. A craft piece whose price depends on the size
  /// somebody wants is a real case, and printing "GHS 0.00" would be a lie.
  String get priceLabel => priceMinor <= 0
      ? 'Ask for a price'
      : '$currency ${(priceMinor / 100).toStringAsFixed(2)}';

  static ShopProduct fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    return ShopProduct(
      id: doc.id,
      name: _text(data['name'], fallback: 'Item'),
      summary: _text(data['summary']),
      description: _text(data['description']),
      category: _text(data['category']),
      priceMinor: _int(data['priceMinor']),
      currency: _text(data['currency'], fallback: 'GHS'),
      imageUrl: _text(data['imageUrl']),
      maker: _text(data['maker']),
      inStock: data['inStock'] != false,
    );
  }
}

/// One line of an order request.
@immutable
class ShopOrderLine {
  const ShopOrderLine({required this.product, this.quantity = 1});

  final ShopProduct product;
  final int quantity;

  int get totalMinor => product.priceMinor * quantity;

  ShopOrderLine withQuantity(int next) =>
      ShopOrderLine(product: product, quantity: next);

  Map<String, Object?> toMap() => {
    'productId': product.id,
    'name': product.name,
    'quantity': quantity,
    'priceMinor': product.priceMinor,
    'currency': product.currency,
  };
}

/// What a member is asking to buy, and how to reach them about it.
@immutable
class ShopOrderDraft {
  const ShopOrderDraft({
    required this.lines,
    required this.contact,
    this.note = '',
  });

  final List<ShopOrderLine> lines;

  /// A phone number, an email, a WhatsApp number — whatever the member gave.
  /// Free text on purpose: insisting on a format would turn away exactly the
  /// members this shop exists for.
  final String contact;

  final String note;

  int get totalMinor =>
      lines.fold<int>(0, (total, line) => total + line.totalMinor);

  String get currency => lines.isEmpty ? 'GHS' : lines.first.product.currency;
}

class CollectionCatalogueRepository {
  const CollectionCatalogueRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<DirectoryApp>> watchApps() => _firestore
      .collection('collectionApps')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map(
        (snapshot) =>
            snapshot.docs.map(DirectoryApp.fromDoc).toList(growable: false),
      );

  Stream<List<ShopProduct>> watchProducts() => _firestore
      .collection('shopProducts')
      .where('published', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map(
        (snapshot) =>
            snapshot.docs.map(ShopProduct.fromDoc).toList(growable: false),
      );

  /// Records an order request against [uid].
  ///
  /// The status is fixed at `requested` here and may only be moved by staff —
  /// see firestore.rules. A member can ask; they cannot mark their own order
  /// fulfilled.
  Future<void> submitOrder({
    required String uid,
    required ShopOrderDraft draft,
  }) => _firestore.collection('shopOrders').add({
    'uid': uid,
    'contact': draft.contact.trim(),
    'note': draft.note.trim(),
    'status': 'requested',
    'items': draft.lines.map((line) => line.toMap()).toList(growable: false),
    'totalMinor': draft.totalMinor,
    'currency': draft.currency,
    'createdAt': FieldValue.serverTimestamp(),
  });
}

final collectionCatalogueRepositoryProvider =
    Provider<CollectionCatalogueRepository?>((ref) {
      if (!ref.watch(firebaseReadyProvider)) return null;
      return CollectionCatalogueRepository(FirebaseFirestore.instance);
    });

final directoryAppsProvider = StreamProvider<List<DirectoryApp>>((ref) {
  final repository = ref.watch(collectionCatalogueRepositoryProvider);
  if (repository == null) return Stream.value(const <DirectoryApp>[]);
  return repository.watchApps();
});

final shopProductsProvider = StreamProvider<List<ShopProduct>>((ref) {
  final repository = ref.watch(collectionCatalogueRepositoryProvider);
  if (repository == null) return Stream.value(const <ShopProduct>[]);
  return repository.watchProducts();
});

String _text(Object? value, {String fallback = ''}) {
  if (value is String && value.trim().isNotEmpty) return value.trim();
  if (value is num) return value.toString();
  return fallback;
}

int _int(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return 0;
}
