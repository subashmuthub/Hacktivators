import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="CogniFlow - Revolutionary AI-Powered Adaptive Learning Platform" />
        <meta name="keywords" content="AI, Education, Adaptive Learning, Cognitive Modeling, EdTech" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}