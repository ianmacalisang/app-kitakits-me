import Script from 'next/script'

// Sets the public page's fixed theme on <html> before the first paint.
// Rendered through next/script (beforeInteractive) because raw <script>
// elements inside components are never executed on client-side navigation
// and React warns about them — PublicPageTheme covers the client-nav case.
export function PrePaintTheme({ dark }: { dark: boolean }) {
  return (
    <Script id="kitakits-prepaint-theme" strategy="beforeInteractive">
      {`try{document.documentElement.classList.toggle('dark',${dark})}catch(e){}`}
    </Script>
  )
}
