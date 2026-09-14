/// Bundled editorial seed content, available without a network connection.
class PlaceStory {
  const PlaceStory({
    required this.id,
    required this.title,
    required this.location,
    required this.image,
    required this.subtitle,
    required this.paragraphs,
    required this.source,
    required this.photographer,
    required this.photoSource,
    required this.license,
    required this.licenseUrl,
  });
  final String id, title, location, image, subtitle, source;
  final String photographer, photoSource, license, licenseUrl;
  final List<String> paragraphs;
}

const placeStories = <PlaceStory>[
  PlaceStory(
    id: 'navrongo-basilica',
    title: 'Our Lady of Seven Sorrows Minor Basilica',
    location: 'NAVRONGO',
    image: 'assets/places/navrongo-basilica.jpg',
    subtitle: 'Faith and local artistry, written in earth.',
    paragraphs: [
      'In Navrongo, the Cathedral Basilica of Our Lady of Seven Sorrows brings Catholic worship and local building traditions into the same space. Often called the Mud Cathedral, it is known for its earthen walls and timber roof structure.',
      'The mission began in the early twentieth century, with a chapel in 1906 and expansion in 1920. Local materials and the work of the community helped give the church its distinctive character. Its story belongs to the people who built and cared for it as well as to the missionaries associated with its beginnings.',
      'Inside, painted walls bring animals and scenes of everyday life alongside Christian imagery. These decorations make the building more than an architectural landmark: they record a meeting of artistic traditions and religious expression.',
      'The church became a minor basilica in 2006. It remains a place of worship, so a visit is also an encounter with a living community. Take time to notice the wall decoration and ask the custodians about the people and techniques behind it.',
    ],
    source: 'https://en.wikipedia.org/wiki/Cathedral_Basilica_of_Our_Lady_of_Seven_Sorrows,_Navrongo',
    photographer: 'Mwintirew',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  ),
  PlaceStory(
    id: 'paga-pond',
    title: 'Paga Crocodile Pond',
    location: 'PAGA',
    image: 'assets/places/paga-pond.jpg',
    subtitle: 'A sacred pond and a story of coexistence.',
    paragraphs: [
      'At Paga in Ghana’s Upper East Region, a pond is both a habitat for crocodiles and a place of deep cultural meaning. Known as the Chief’s Pond, it has become one of the area’s best-known visitor destinations.',
      'Local oral tradition connects the crocodiles with the lives and ancestors of the people of Paga. One account tells of a crocodile guiding a man to water and saving his life; in gratitude, he declared that the animals should be protected. These are community traditions, passed on through storytelling.',
      'That relationship has shaped how the pond is understood and cared for. Visitors often arrive curious about the animals, but the fuller story is about the beliefs and responsibilities surrounding them.',
      'Listen to the local custodians as they explain the pond’s history. The crocodiles are wild animals: observe them under the direction of a local guide, and let respect for the place and its community shape your visit.',
    ],
    source: 'https://en.wikipedia.org/wiki/Paga_Crocodile_Pond',
    photographer: 'Dieu-Donné Gameli',
    photoSource:
        'https://commons.wikimedia.org/wiki/File:Paga_Crocodile_Pond.jpg',
    license: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  ),
  PlaceStory(
    id: 'tono-dam',
    title: 'Tono Dam',
    location: 'NEAR NAVRONGO',
    image: 'assets/places/tono-dam.png',
    subtitle: 'Water that carries the farming season forward.',
    paragraphs: [
      'Near Navrongo, Tono Dam holds a story about water, food and the rhythms of farming in northern Ghana. The reservoir is part of an irrigation scheme created to help small-scale farmers grow crops beyond the rainy season.',
      'Construction began in 1975 and was completed in 1985. The scheme is managed by the Irrigation Company of Upper Region, commonly called ICOUR. Its canals connect stored water with farmland across the surrounding communities.',
      'Rice, tomatoes and soya beans are among the crops associated with the scheme. The reservoir is therefore more than a broad view of water: it is part of the everyday work and livelihoods of the people who farm around it.',
      'The lake also provides habitat for birds. Looking across the water offers a different perspective on the Navrongo landscape, where cultivated land, seasonal change and the work of managing water meet.',
    ],
    source: 'https://en.wikipedia.org/wiki/Tono_Dam_(Ghana)',
    photographer: 'Apiu Akwojong Ezekiel',
    photoSource: 'https://commons.wikimedia.org/wiki/File:Tono_Dam_AWC_Water_for_life_4.png',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  ),
];
