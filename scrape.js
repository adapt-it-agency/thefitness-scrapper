const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const locations = [
    'branimir', 'dubrava', 'greengold', 'dvorana', 'hala', 'hob',
    'kaptol', 'mamutica', 'zcentar', 'zavrtnica', 'zonar'
];

const scrapeAndClean = async (location) => {
    const url = `https://${location}.thefitness.hr/calendar`;
    const baseUrl = `https://${location}.thefitness.hr`;
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const cleanedHTML = await page.evaluate((baseUrl) => {
        document.querySelectorAll('div.event').forEach(event => {
            const eventName = event.querySelector('p.event_name');
            if (eventName && eventName.textContent.trim() === 'Padel') {
                event.remove();
            }
        });
        
        const header = document.querySelector('header');
        if (header) header.remove();

        const mobileIcons = document.querySelector('.mobile-icons');
        if (mobileIcons) mobileIcons.remove();

        const nav = document.querySelector('footer nav');
        if (nav) nav.remove();

        const calendarMain = document.querySelector('section.calendar_main');
        if (calendarMain) calendarMain.remove();
        
        document.querySelectorAll('link[href]').forEach(link => {
            if (link.getAttribute('href') && link.getAttribute('href').startsWith('/')) {
                link.setAttribute('href', baseUrl + link.getAttribute('href'));
            }
        });
        
        document.querySelectorAll('script[src]').forEach(script => {
            if (script.getAttribute('src') && script.getAttribute('src').startsWith('/')) {
                script.setAttribute('src', baseUrl + script.getAttribute('src'));
            }
        });
        const head = document.querySelector('head');
        if (head) {
            const noCacheMetaTags = `
                <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, proxy-revalidate" />
                <meta http-equiv="Pragma" content="no-cache" />
                <meta http-equiv="Expires" content="0" />
            `;
            head.insertAdjacentHTML('beforeend', noCacheMetaTags);
        }
        
        return document.documentElement.outerHTML;
    }, baseUrl);
    const locationDir = path.join(__dirname, location);
    if (!fs.existsSync(locationDir)) {
        fs.mkdirSync(locationDir);
    }
    const outputPath = path.join(locationDir, 'index.html');
    fs.writeFileSync(outputPath, cleanedHTML);
    console.log(`HTML saved to ${outputPath}`);

    await browser.close();
};

// Schedule to run every 30 minutes
cron.schedule('*/30 * * * *', () => {
    console.log('Running scraper for all locations...');
    locations.forEach(location => scrapeAndClean(location));
});

// Run once on startup
locations.forEach(location => scrapeAndClean(location));
