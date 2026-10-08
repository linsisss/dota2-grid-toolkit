// Yandex Metrika (asked for on 2026-10-08: «добавь счетчик яндекс метрики везде на сайте»), the code as the
// counter's settings gave it. Production only: the build puts it in every page (vite.config.mjs, not in
// staging builds, which have GRIDSTUDIO_BUILD_LABEL), the server in its own pages when the origin is the site's
// (server/seo-pages.mjs, server/seo-guides.mjs). The site's own visit counter (src/site-stats.js) stays.
export const METRIKA_ID = 113559366;
export const METRIKA_ORIGIN = 'https://gridstudio.me';
export const metrikaTag = () => `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}', 'ym');

    ym(${METRIKA_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${METRIKA_ID}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
<!-- /Yandex.Metrika counter -->`;
// Right after <head>, as close to the start of the page as the counter's instructions ask.
export const withMetrika = (html, on = true) => (on ? html.replace(/<head>/i, (head) => `${head}\n${metrikaTag()}`) : html);
