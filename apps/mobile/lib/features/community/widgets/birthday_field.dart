import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';

/// The month and the day, and nothing else.
///
/// ── Why no year ───────────────────────────────────────────────────────────
/// A community profile is world-readable. A full date of birth on one is the
/// single most useful thing somebody impersonating a member could take, and the
/// community wants the field for exactly one reason — knowing whose day it is.
/// The day answers that on its own, so the year is never asked for and there is
/// nowhere in the model to put it.
///
/// ── Why two dropdowns rather than a date picker ───────────────────────────
/// Every date picker Flutter ships asks for a year, because a `DateTime` cannot
/// exist without one. Opening one here would mean showing a field we refuse to
/// keep, and then quietly throwing the answer away — which is worse than not
/// asking. Two lists ask for precisely what is stored.
class BirthdayField extends StatelessWidget {
  const BirthdayField({
    required this.month,
    required this.day,
    required this.onChanged,
    this.helper =
        'Your community sees the day so they can wish you well. The year is '
        'never asked for.',
    super.key,
  });

  /// 1-12, or 0 for "not said".
  final int month;

  /// 1-31, or 0 for "not said".
  final int day;

  /// Called with the new pair. Either half may be 0 while the member is still
  /// choosing; a birthday only counts once both are set.
  final void Function(int month, int day) onChanged;

  final String helper;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    // 31 April is not a date. Narrowing the day list as soon as the month is
    // known is the only place this can be said without a refusal afterwards.
    final maxDay = month == 0 ? 31 : daysInBirthMonth(month);
    final chosen = day >= 1 && day <= maxDay ? day : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.cake_outlined, size: 18, color: brand.accent),
            const SizedBox(width: 8),
            Text(
              'Your birthday',
              style: TextStyle(
                color: brand.ink,
                fontSize: 14.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'Optional',
              style: TextStyle(
                color: brand.mutedInk,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              flex: 3,
              child: DropdownButtonFormField<int>(
                key: const Key('birthday-month'),
                initialValue: month == 0 ? null : month,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Month'),
                items: [
                  for (var index = 0; index < monthNames.length; index++)
                    DropdownMenuItem<int>(
                      value: index + 1,
                      child: Text(monthNames[index]),
                    ),
                ],
                onChanged: (value) {
                  final picked = value ?? 0;
                  // Moving from March to February with the 31st chosen has to
                  // drop the day rather than keep a date that cannot exist.
                  final limit = picked == 0 ? 31 : daysInBirthMonth(picked);
                  onChanged(picked, day > limit ? 0 : day);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: DropdownButtonFormField<int>(
                key: const Key('birthday-day'),
                initialValue: chosen,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Day'),
                items: [
                  for (var value = 1; value <= maxDay; value++)
                    DropdownMenuItem<int>(value: value, child: Text('$value')),
                ],
                onChanged: (value) => onChanged(month, value ?? 0),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          helper,
          style: TextStyle(color: brand.mutedInk, fontSize: 12, height: 1.4),
        ),
        // Half an answer is not an answer, and the member is the only one who
        // can finish it. Said here rather than at the save, which would refuse
        // a form that looks complete.
        if ((month == 0) != (chosen == null)) ...[
          const SizedBox(height: 6),
          Text(
            month == 0
                ? 'Pick the month too, or clear the day.'
                : 'Pick the day too, or leave the month blank.',
            key: const Key('birthday-incomplete'),
            style: TextStyle(
              color: brand.terracotta,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}
