

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import "dotenv/config";


// Debugging environment variables
// console.log("🔍 PINECONE_API_KEY:", process.env.PINECONE_API_KEY);
// console.log("🔍 PINECONE_INDEX_NAME:", process.env.PINECONE_INDEX_NAME);
// console.log("🔍 OPENAI_API_KEY:", process.env.OPENAI_API_KEY);

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });


async function insertData(id: string, text: string, metadata: Record<string, any>) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);

  await index.upsert([
    {
      id,
      values: embedding.data[0].embedding,
      metadata: {
        ...metadata,
        text, // Include original text for semantic search
      },
    },
  ]);

  console.log(`✅ Inserted: ${id}`);
}
async function queryData(query: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: query,
  });

  const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
  const response = await index.query({
    vector: embedding.data[0].embedding,
    topK: 2,
    includeMetadata: true,
  });

  console.log("🔍 Query Results:", JSON.stringify(response, null, 2));
}

// Sample Data
const documents = [
      {
        "id": "graphy_chunk_1",
        "metadata": {
          "section": "Title & Index",
          "description": "The cover page with the report title and a table of contents listing the sections."
        },
        "text": "[Graphy Report] Competitive Report\n\nGet a complete Creative Ad & Landing Page Audit to uncover what works, learn from top competitors, and optimize for higher conversions. Actionable insights to refine your messaging, boost engagement, and maximize ROI. Stay ahead—turn insights into impact!\n\nINSANE LABS\n\nIndex\nCreative Media Mix Analysis\nThemes in the Ads and Their Frequency\nSummary Table of Themes & Frequency\nObservations\nTakeaway for Competitors\nCTA URL Distribution Summary\nDetailed Breakdown\nCTA Button Text Distribution\nObservations\nStrategic Implications\nCRO Analysis of Graphy's Sell Astrology Courses Landing Page\nKey Takeaways for Competitors\nLanding Page Analysis: Graphy (UPSC Course Platform)\nKey Takeaways for Competitors\nLanding Page Analysis: Graphy (Stock Market Course Platform)\nKey Takeaways for Competitors\nConclusion\nAbout us"
      },
      {
        "id": "graphy_chunk_2",
        "metadata": {
          "section": "Creative Media Mix Analysis",
          "description": "An overview of the media mix used in Graphy's campaigns, including dual funnel strategy details."
        },
        "text": "[Graphy Report] Creative Media Mix\n\nFacebook Lead Ads\n15\n\nDomain-Specific Landing Pages\n13\n\nDual Funnel Strategy: Graphy uses a dual approach – Facebook Lead Ads keep users within Facebook for immediate lead capture, while Domain-Specific Landing Pages drive targeted traffic for specialized messaging. Vertical-Specific Focus: 46.4% of ads direct users to domain-specific pages. Conversion-Focused Approach: High frequency of 'Sign Up' CTAs (53.6%) indicates a priority on direct lead generation. Sophisticated Tracking: Utilizes dynamic UTM parameters (e.g., {campaign.name}, {ad.name})."
      },
      {
        "id": "graphy_chunk_3",
        "metadata": {
          "section": "Themes in the Ads & Frequency",
          "description": "Detailed analysis of the recurring themes in the ads, including frequency and examples."
        },
        "text": "[Graphy Report] Themes in the Ads and Their Frequency\n\n1. All-in-One Platform for Online Teaching – Frequency: 7 occurrences\n   Description: Emphasizes Graphy as a comprehensive solution to replace multiple tools. Examples include messaging on simplicity and integration.\n\n2. Domain-Specific Course Solutions – Frequency: 7 occurrences\n   Description: Focuses on tailored solutions for niches like UPSC, trading, astrology, etc. Examples highlight transforming specific knowledge into business success.\n\n3. Branded Website & Mobile App Creation – Frequency: 5 occurrences\n   Description: Stresses the benefit of having a unique digital presence through branded websites and mobile apps.\n\n4. Business Growth & Revenue Scaling – Frequency: 4 occurrences\n   Description: Focuses on increasing revenue and business expansion.\n\n5. Quick & Easy Platform Launch – Frequency: 3 occurrences\n   Description: Emphasizes the simplicity and speed of launching an online teaching business.\n\n6. Hindi/Local Language Marketing – Frequency: 2 occurrences\n   Description: Targets the Indian educator market with localized messaging.\n\nSummary Table of Themes & Frequency\nAll-in-One Platform for Online Teaching: 7\nDomain-Specific Course Solutions: 7\nBranded Website & Mobile App Creation: 5\nBusiness Growth & Revenue Scaling: 4\nQuick & Easy Platform Launch: 3\nHindi/Local Language Marketing: 2"
      },
      {
        "id": "graphy_chunk_4",
        "metadata": {
          "section": "Observations & Strategic Implications",
          "description": "Observations on the ad strategies and strategic recommendations for competitors."
        },
        "text": "[Graphy Report] Observations\n\n- Vertical-Specific Marketing Strategy: A significant portion of the ads target niche teaching domains.\n- Platform Independence: Emphasis on branded websites and mobile apps indicates a focus on creator control.\n- Technical Barrier Removal: Highlights ease-of-use to overcome technical challenges in online education setups.\n- Local Market Focus: Use of Hindi language ads points to targeting the Indian market.\n\nStrategic Implications\n\nCompetitors should:\n1. Develop Vertical-Specific Features\n2. Emphasize Creator Independence\n3. Simplify Technical Onboarding\n4. Target Underserved Verticals"
      },
      {
        "id": "graphy_chunk_5",
        "metadata": {
          "section": "CTA URL & Button Analysis",
          "description": "Breakdown of CTA URLs and button text used in the ads, including frequency and percentage."
        },
        "text": "[Graphy Report] CTA URL Frequency & Percentage\n\n- http://fb.me/ : 15 ads (53.6%)\n- https://events.graphy.com/sell-astrology-courses : 5 ads (17.8%)\n- https://events.graphy.com/sell-trading-courses : 4 ads (14.3%)\n- https://events.graphy.com/sell-upsc-courses : 3 ads (10.7%)\n- https://events.graphy.com/sell-technical-courses : 1 ad (3.6%)\n\nCTA Button Text Distribution\n\n- 'Sign Up' : 15 ads (53.6%)\n- 'Learn More' : 13 ads (46.4%)"
      },
      {
        "id": "graphy_chunk_6",
        "metadata": {
          "section": "Landing Page Analysis: Sell Astrology Courses",
          "description": "In-depth analysis of the Graphy landing page for Sell Astrology Courses, including pros, cons, and key takeaways."
        },
        "text": "[Graphy Report] CRO Analysis of Graphy's Sell Astrology Courses Landing Page\n\nRating: 8/10\n\nPros:\n1. Compelling Headline & Subheadline that address monetization goals.\n2. Strong Social Proof: Stats (e.g., ₹110 cr+ earned) and testimonials (including recognizable figures).\n3. Clear Feature Breakdown: Showcases platform benefits like branded websites, AI tools, and mobile-first design.\n4. Multiple CTAs guiding users to conversion.\n\nCons:\n1. Generic visuals and overused icons reduce authenticity.\n2. Lack of urgency (missing limited-time offers or scarcity cues).\n3. Redundant CTAs and weak footer design.\n\nKey Takeaways for Competitors:\n- Leverage niche-specific visuals and testimonials\n- Enhance urgency through time-sensitive offers\n- Contextualize features for the specific audience\n- Optimize CTA language and footer details"
      },
      {
        "id": "graphy_chunk_7",
        "metadata": {
          "section": "Landing Page Analysis: UPSC & Stock Market Platforms",
          "description": "Comparative analysis of Graphy’s landing pages for UPSC and Stock Market courses with ratings, pros, cons, and competitor insights."
        },
        "text": "[Graphy Report] Landing Page Analysis: Graphy (UPSC Course Platform)\n\nRating: 7.5/10\n\nPros:\n- Strong value proposition tailored for UPSC educators\n- Credible testimonials and social proof\n- Feature-rich platform with clear CTAs\n\nCons:\n- Cluttered design\n- Lack of urgency or free trial/demonstration\n- Overuse of technical jargon\n\nKey Takeaways for Competitors:\n- Simplify messaging and design\n- Leverage niche-specific testimonials\n- Introduce urgency with limited-time offers and demos\n\nLanding Page Analysis: Graphy (Stock Market Course Platform)\n\nRating: 7/10\n\nPros:\n- Clear niche targeting for stock market educators\n- Comprehensive feature set and mobile accessibility\n- Effective CTAs\n\nCons:\n- Generic testimonials that lack industry specificity\n- Cluttered visuals and redundant content\n- Absence of niche-specific customization and urgency\n\nKey Takeaways for Competitors:\n- Highlight trading-specific tools and integrations\n- Use industry-tailored social proof\n- Simplify visual design and add urgency elements"
      },
      {
        "id": "graphy_chunk_8",
        "metadata": {
          "section": "Conclusion & About Us",
          "description": "Final conclusions of the report along with background information about Graphy."
        },
        "text": "[Graphy Report] Conclusion\n\nGraphy excels in vertical-specific marketing and creator independence messaging but lacks innovation in brand-building and localized campaigns. Competitors can disrupt by focusing on niche verticals, simplified onboarding, superior white-labeling features, and optimized localized messaging for higher engagement.\n\nAbout us\n\nGraphy positions itself as a comprehensive solution for online education. The report emphasizes the platform’s strengths in targeted ad strategies and conversion-focused landing pages."
      },
      
    {
      "id": "SimplyCue_chunk_1",
      "metadata": {
        "section": "Who We Are",
        "description": "Introduction of Simply Cue as an innovative platform that empowers creators by hosting, selling, and managing their digital and physical products."
      },
      "text": "Simply Cue - Platform Overview\n\nWho We Are\n\nSimply Cue is an innovative platform designed to empower creators by enabling them to host, sell, and manage their digital and physical products effortlessly. Our mission is to simplify the creator journey, making it easy to build, monetize, and scale digital experiences while handling all the complexities of payments and compliance."
    },
    {
      "id": "SimplyCue_chunk_2",
      "metadata": {
        "section": "What We Do",
        "description": "Overview of Simply Cue's functionality and how it bridges the gap between creators and their audiences."
      },
      "text": "Simply Cue - Platform Overview\n\nWhat We Do\n\nAt Simply Cue, we bridge the gap between creators and their audiences by offering a robust and flexible platform. Whether you're an educator, artist, podcaster, or entrepreneur, Simply Cue provides the tools you need to build your brand, manage your community, and monetize your content. From hosting e-books and courses to managing webinars and one-on-one sessions, our platform is built for versatility."
    },
    {
      "id": "SimplyCue_chunk_3",
      "metadata": {
        "section": "Platform Key Features",
        "description": "A detailed list of key features provided by Simply Cue, highlighting its capabilities in hosting, monetization, compliance, and more."
      },
      "text": "Simply Cue - Platform Overview\n\nPlatform Key Features\n\n- Seamless Product Hosting: Easily upload and manage digital and physical products with structured catalog management.\n\n- Monetization Tools: Integrated payment gateways and flexible pricing options, including one-time purchases, subscriptions, and bundles.\n\n- Regulatory Compliance: Automated GST and tax compliance with clear reporting.\n\n- Content Creation and Management: Rich media hosting, streaming, and content organization tools for creators of all types.\n\n- Member Management: Built-in CRM for managing customer interactions, membership tiers, and user engagement.\n\n- Custom Subdomains: Launch your branded storefront with a personalized subdomain.\n\n- Dashboard and Analytics: In-depth insights into product performance, sales data, and customer engagement.\n\n- Multi-Tenancy Support: Cater to multiple creators or businesses under one umbrella with robust access control and management."
    },
    {
      "id": "SimplyCue_chunk_4",
      "metadata": {
        "section": "Why Choose Simply Cue?",
        "description": "Highlights the benefits and competitive advantages of using Simply Cue, including comprehensive solutions, customizability, community support, reliability, and a creator-centric approach."
      },
      "text": "Simply Cue - Platform Overview\n\nWhy Choose Simply Cue?\n\n- Comprehensive Solutions: From product creation to revenue management, Simply Cue covers every aspect of the creator journey.\n\n- Customizability: Adapt the platform to your brand with ease, thanks to our flexible design and customization options.\n\n- Community Support: Engage and manage your audience effortlessly with integrated community features.\n\n- Reliability and Security: Trust in a platform that prioritizes data protection, secure transactions, and uptime reliability.\n\n- Creator-Centric Approach: Our platform is designed with creators at its core, providing the infrastructure needed to focus on creating great content."
    }
  

];

async function main() {
  for (const doc of documents) {
    await insertData(doc.id, doc.text, doc.metadata);
  }
  // await queryData("What does Simply Cue do?");
}

main().catch(console.error);
