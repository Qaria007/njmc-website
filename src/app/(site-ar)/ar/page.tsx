import type { Metadata } from 'next'

// Phase 1 shell. Heading and text are the owner's existing Arabic from the live
// homepage (docs/old-site/pages/index-ar.txt); no new Arabic.
export const metadata: Metadata = {
  alternates: { canonical: '/ar/', languages: { en: '/', ar: '/ar/', 'x-default': '/' } },
  robots: { index: false, follow: false },
}

export default function ArabicHomePage() {
  return (
    <section className="hero">
      <div className="container">
        <h1>معدات ومستهلكات طبية، مكونات صيدلانية فعالة، وخدمات استشارية متخصصة</h1>
        <p>
          شركة NJMC Medical Supplies للتوريدات الطبية تقوم بتوريد المعدات الطبية والمستهلكات الطبية والمكونات
          الصيدلانية الفعالة من الصين والهند، وتقدم خدمات استشارية للمستشفيات والمؤسسات الطبية حول العالم.
        </p>
      </div>
    </section>
  )
}
