"""Extract the supplied corrected book without treating its prose as instructions.

Usage: bundled-python firebase/seed/extract-kasem-orthography.py path/to/book.docx
The import keeps source spellings and page references; rules are curated separately.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data' / 'orthography-seed'

def extract(path):
    document = Document(path)
    blocks = []
    for child in document.element.body:
        if child.tag.endswith('}p'):
            text = ''.join(child.xpath('.//w:t/text()')).strip()
            if text: blocks.append({'kind': 'paragraph', 'text': text})
        elif child.tag.endswith('}tbl'):
            blocks.append({'kind': 'table', 'rows': [
                ['\n'.join(''.join(p.xpath('.//w:t/text()')) for p in cell.xpath('./w:p'))
                 for cell in row.xpath('./w:tc')] for row in child.xpath('./w:tr')]})
    entries, examples, tables = [], [], []
    section, page = '', ''
    vocabulary_rows = 0

    def add(word, meaning, pos='', locator='', note='', source_form=''):
        word = word.strip().strip('“”').strip('/').strip()
        if not word or not meaning: return
        pos = pos or 'Not specified in source'
        forms = [s.strip() for s in re.split(r'[/,]', word) if s.strip()]
        for form in forms:
            key = (form.casefold(), meaning, pos)
            previous = next((e for e in entries if (e['headword'].casefold(), e['translation'], e['partOfSpeech']) == key), None)
            if previous:
                previous['sourceRefs'] = sorted(set(previous['sourceRefs'] + [locator]))
                continue
            entries.append({'id': 'bgl97-' + hashlib.sha256('|'.join(key).encode()).hexdigest()[:24],
                'headword': form, 'translation': meaning, 'partOfSpeech': pos or 'Not specified in source',
                'alternateForms': [f for f in forms if f != form], 'sourceRefs': [locator],
                'sourceForm': source_form or word, 'note': note})

    for index, block in enumerate(blocks):
        if block['kind'] == 'paragraph':
            text = block['text']
            if text.startswith('PDF page'): page = text
            if text in ('The Kasem alphabet', 'Representation of Kasem vowel sounds by vowel symbols',
                        'The motivation for the above suggestions', 'Spelling long vowels',
                        'Vowel digraphs and polysyllabic words', 'Labialization', 'Full spelling and reduced forms',
                        'Noun and determiner constructions', 'Verbs and objects in sentences', 'Nasal final words',
                        'Vowel reductions within words', 'Word division', 'Noun adjective constructions',
                        'Nyeno compounds', 'Verb deverbative compounds', 'Rankshifted clauses',
                        'Opaque exo centric constructions', 'The use of diacritics in orthography', 'Tone',
                        'Some grammatical terms', 'Some vocabulary items', 'Table of simple pronouns', 'List of numerals'):
                section = text
            # Only written forms paired explicitly with a meaning. IPA and starred
            # rejected spellings are never inferred as headwords.
            if 83 <= index < 197:
                for match in re.finditer(r'(?<![\w/\*])([A-Za-zɛɔŋáéóàèì-]+)\s+“([^”]+)”', text):
                    word, meaning = match.groups()
                    if word.casefold() in {'by','as','or','for','of','the','with','in','and','write','meaning','tu','means','mean','verb','a','ba'}: continue
                    add(word, meaning, locator=f'{section}; {page}; block {index}')
            continue
        rows = block['rows']; header = rows[0]
        locator = f'{section}; {page}; table {index}'
        tables.append({'section': section, 'sourceRef': locator, 'header': header, 'rows': rows[1:]})
        if header == ['Kasem', 'Part of speech', 'Meaning / usage', 'PDF']:
            for word, pos, meaning, p in rows[1:]:
                vocabulary_rows += 1
                note = ''
                if word == 'ɑ':
                    note = 'Source prints ɑ; the explicit tone rule specifies á for plural you.'
                    source_form, word = word, 'á'
                else: source_form = word
                if not meaning and word == 'zwi':
                    meaning = 'birds'; note = 'Meaning supplied by the other explicit zwi row on source page 57; page 58 cell is blank.'
                add(word, meaning, pos, f'Vocabulary; PDF page {p}', note, source_form)
        elif header == ['No.', 'English', 'Kasem']:
            for _, meaning, word in rows[1:]: add(word, meaning, 'grammatical term', locator)
        elif header == ['Rule', 'Sound', 'Symbol', 'Examples']:
            for row in rows[1:]:
                for m in re.finditer(r'([a-zɛɔŋ]+)\s+“([^”]+)”', row[3]): add(*m.groups(), locator=locator)
        elif header == ['Word sound', 'Meaning', 'Old spelling', 'New spelling']:
            for _, meaning, _, word in rows[1:]: add(word, meaning, locator=locator)
        elif header == ['Sound', 'Meaning', 'Correct spelling']:
            for _, meaning, word in rows[1:]:
                if ' as in ' in word:
                    word, sentence = word.split(' as in ', 1)
                    examples.append({'kasem': sentence.strip('“”'), 'english': '', 'section': section, 'sourceRef': locator})
                add(word, meaning, locator=locator)
        elif header in (['Reduced pronunciation', 'Full spelling', 'Meaning'], ['Pronunciation', 'Full spelling', 'Meaning']):
            for _, word, meaning in rows[1:]:
                examples.append({'kasem': word, 'english': meaning, 'section': section, 'sourceRef': locator})
                if ' ' not in word: add(word, meaning, locator=locator)
        elif header in (['Noun and adjective', 'Compound', 'Meaning'], ['Components', 'Compound', 'Meaning']):
            for _, word, meaning in rows[1:]: add(word, meaning, locator=locator)
        elif header == ['Form', 'Alternative form', 'Meaning']:
            for word, alternative, meaning in rows[1:]: add(word + '/' + alternative, meaning, locator=locator)
        elif header == ['Example', 'Meaning']:
            for word, meaning in rows[1:]:
                if index == 168: add(word, meaning, locator=locator)
                else: examples.append({'kasem': word, 'english': meaning, 'section': section, 'sourceRef': locator,
                    'note': 'Both conditional rows have identical Kasem in the supplied document; interpretation is ambiguous.' if index == 190 else ''})

    for word, meaning in [('kwo','father'),('kogo','feather'),('kwogo','zombi'),('kugu','maize cob'),
                          ('pi','sheep, plural'),('swoa','guinea chicks'),('ywoa','wooden pillars'),
                          ('twoa','fruits of baobab'),('keilli','cheek'),('teiri','pig'),('beiri','to faint'),
                          ('keila','cheeks'),('beilla','Mossiman'),('lwooru','beggar'),('lelei','now'),
                          ('twe','to insult'),('twi','to spit out'),('bwei','to ask'),('bwɛ','to discuss'),
                          ('pwoa','source example of a labialised central vowel'),('badwoŋi','friend'),
                          ('saŋe','cook'),('vaŋe','pull'),('jwoŋi','to receive'),('tɔŋe','to send'),
                          ('na-digiru','dirty water'),('teo tu','political leader/head of state'),
                          ('podea tu','brave one'),('manlaataŋa','rainbow'),('digabu/tiabu','cat'),
                          ('diga bu',"one's child"),('manlaa taŋa',"the chameleon's bow"),
                          ('á','you, plural subject'),('dé','we, plural subject'),('wó','positive future marker'),
                          ('yé','negative imperative marker'),('baa','future negative marker'),
                          ('deém','long ago'),('deem','last year'),('véi','go, imperative'),
                          ('vèi','went, past'),('vei','going or intending to go')]:
        add(word,meaning,locator='Spelling rules and tone sections; PDF pages 13–29')
    add('Ajegedawe', 'I have a quarrel with my maker; personal name', 'proper name', 'Rankshifted clauses; PDF pages 25–26')
    examples.extend([
        {'kasem':'jege de a we','english':'I have a quarrel with my maker','section':'Rankshifted clauses','sourceRef':'PDF pages 25–26'},
        {'kasem':'ka wó ba','english':'she will come','section':'Word division','sourceRef':'PDF pages 23–25',
         'note':'Source typography w^o is rendered as wó following the explicit positive-future tone rule.'},
    ])
    # The appendices enumerate forms by person/class and by number. Preserve
    # complete tables as well as exposing their lexical forms for search.
    pronouns = next(t for t in tables if t['header'][0] == 'Person')
    for person, gender, sg, emph_sg, pl, emph_pl in pronouns['rows']:
        for word, number, emphatic in ((sg,'singular',False),(emph_sg,'singular',True),(pl,'plural',False),(emph_pl,'plural',True)):
            if person == '2nd' and word == 'à': word = 'á'
            add(word, f'{person} person {number}' + (' emphatic' if emphatic else '') + (f', noun class {gender}' if gender != '—' else ''),
                'pronoun', pronouns['sourceRef'], 'The pronoun appendix differs from some tone/vocabulary rows; preserve class labels and consult the tone rules.')
    cardinals = ['kalo/dedoa','nle','ntɔ','nna','nnu','ndo','npae','nana','nogobo/nogo','fuga']
    for n, word in enumerate(cardinals,1): add(word, str(n), 'numeral', 'Cardinals; PDF pages 60–61')
    ordinals = next(t for t in tables if t['header'][0] == 'Gender' and 'Singular prefix' in t['header'])
    for gender, sg_p, sg_stem, pl_p, *stems in ordinals['rows']:
        add(sg_p.rstrip('-') + sg_stem.lstrip('-'), f'one, noun class {gender}, singular', 'numeral', ordinals['sourceRef'])
        for n, stem in enumerate(stems,2): add(pl_p.rstrip('-') + stem.lstrip('-'), f'{n}, noun class {gender}, plural', 'numeral', ordinals['sourceRef'])
    for word, meaning in [('bedwe','once'),('bilei','twice'),('betɔ','three times'),('bena','four times'),('binu','five times'),('beredo','six times'),('nerepae/berepɛ','seven times')]:
        add(word,meaning,'multiplicative numeral','Multiplicatives; PDF pages 60–61')
    payload = {'importId':'bgl-kasem-orthography-1997', 'sourceDocumentName':Path(path).name,
        'sourceSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        'attribution':'Kasem Language Committee, Kasem Orthography: Spelling Rules. Bureau of Ghana Languages, Accra, 1997. ISBN 9964-2-0366-7.',
        'dialect':'Ghana Kasem', 'entries':entries, 'examples':examples,
        'referenceTables':[t for t in tables if t['header'][0] in ('Person','Gender','Abbreviation')],
        'vocabularyRowCount':vocabulary_rows,
        'sourceIssues':['Vocabulary prints ɑ for plural you; explicit tone rule uses á.',
            'Pronoun appendix prints à for plural you and amo for a third-person emphatic form; conflicting forms remain documented.',
            'Conditional/subordinator section gives identical na sentences with different English meanings.',
            'Several source glosses and part-of-speech labels have apparent typographical errors. They are retained, not silently reinterpreted.',
            'The empty zwi gloss on page 58 is supplied from the explicit birds gloss on page 57.']}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'book.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'vocabularyRows':vocabulary_rows,'entries':len(entries),'examples':len(examples)},ensure_ascii=True))
    return payload

if __name__ == '__main__': extract(sys.argv[1])
