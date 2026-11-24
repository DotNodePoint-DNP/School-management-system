import type { Prisma } from '../generated/prisma/client.js';

// Empty updates preserve editorial changes, dates, drafts and photo captions on subsequent seed runs.
export async function seedWebsite(
  tx: Prisma.TransactionClient,
  now = new Date(),
) {
  const onDay = (days: number) =>
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + days,
      ),
    );
  const schoolTime = (days: number, hours: number, minutes: number) =>
    new Date(onDay(days).getTime() + (hours * 60 + minutes - 345) * 60000);
  const pages = [
    {
      section: 'home',
      slug: 'learning-in-our-community',
      title: 'Learning in our community',
      subtitle: 'A school rooted in Nepal',
      body: 'Students learn in Nepali and English, investigate their surroundings and share their work with families.',
    },
    {
      section: 'about',
      slug: 'our-school-community',
      title: 'Our school community',
      body: 'Families, teachers and the school management committee meet each term to discuss learning, wellbeing and access to education.',
    },
    {
      section: 'academics',
      slug: 'learning-from-basic-to-secondary',
      title: 'Basic and secondary education',
      body: 'Classes combine the national curriculum with local studies. Students practise mathematics through market surveys, document oral histories in Nepali and explore science through practical work.',
    },
    {
      section: 'facilities',
      slug: 'library-and-reading-room',
      title: 'Library and reading room',
      body: 'The library brings together Nepali literature, English readers and reference books. Each class visits during its weekly reading period.',
    },
  ] as const;
  for (const page of pages)
    await tx.websiteEntry.upsert({
      where: { slug: page.slug },
      update: {},
      create: { ...page, published: true, sortOrder: 10 },
    });
  for (const notice of [
    {
      slug: 'admission-office-visiting-hours',
      title: 'Admission office visiting hours',
      category: 'admission',
      isPinned: true,
      body: 'Families enquiring about admission may visit the school office from Sunday to Friday, 10:00 am to 3:00 pm. Bring the previous progress report if available.',
    },
    {
      slug: 'science-exhibition-registration',
      title: 'Registration for the school science exhibition',
      category: 'event',
      isPinned: false,
      body: 'Student teams may submit a short project outline to their science teacher. Families are welcome to visit the exhibition.',
    },
  ] as const)
    await tx.notice.upsert({
      where: { slug: notice.slug },
      update: {},
      create: { ...notice, published: true, publishedAt: now },
    });
  for (const event of [
    {
      slug: 'community-science-exhibition',
      title: 'Community science exhibition',
      venue: 'School courtyard',
      description:
        'Students demonstrate water filtration, renewable energy models and local biodiversity surveys.',
      startsAt: schoolTime(14, 10, 0),
      endsAt: schoolTime(14, 15, 0),
    },
    {
      slug: 'family-reading-morning',
      title: 'Family reading morning',
      venue: 'School library',
      description:
        'Families and students read short stories in Nepali and English with the library team.',
      startsAt: schoolTime(21, 9, 0),
      endsAt: schoolTime(21, 11, 0),
    },
  ])
    await tx.websiteEvent.upsert({
      where: { slug: event.slug },
      update: {},
      create: { ...event, published: true },
    });
  const bookPhoto =
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66';
  await tx.galleryAlbum.upsert({
    where: { slug: 'reading-week' },
    update: {},
    create: {
      slug: 'reading-week',
      title: 'Reading week',
      description:
        'A reading-week album with an illustrative library photograph.',
      coverImage: bookPhoto,
      eventDate: onDay(-7),
      published: true,
      photos: {
        create: [
          {
            imageUrl: bookPhoto,
            altText: 'Shelves of books in a library',
            caption: 'Reading week · library collection',
          },
        ],
      },
    },
  });
  await tx.careerPosting.upsert({
    where: { slug: 'secondary-science-teacher' },
    update: {},
    create: {
      slug: 'secondary-science-teacher',
      title: 'Secondary science teacher',
      department: 'Science',
      employmentType: 'full_time',
      vacancies: 1,
      qualification:
        'Bachelor’s degree in science or science education and an appropriate teaching licence.',
      experience:
        'Classroom and practical laboratory teaching experience preferred.',
      description:
        'Teach secondary science, supervise practical work and mentor student exhibition teams. Submit your CV and a short statement about your teaching approach.',
      deadline: onDay(30),
      published: true,
    },
  });
}
