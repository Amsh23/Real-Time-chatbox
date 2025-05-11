const puppeteer = require('puppeteer');

describe('UI and Responsiveness Tests', () => {
    let browser;
    let page;

    beforeAll(async () => {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox']
        });
    });

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    afterAll(async () => {
        await browser.close();
    });

    test('should render correctly on mobile devices', async () => {
        // Set mobile viewport
        await page.setViewport({
            width: 375,
            height: 812,
            isMobile: true
        });

        await page.goto('http://localhost:3000');

        // Check if elements are properly visible
        const container = await page.$('.container');
        const containerDisplay = await page.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('flex-direction'),
            container
        );
        expect(containerDisplay).toBe('column');

        // Check sidebar width
        const sidebar = await page.$('.sidebar');
        const sidebarWidth = await page.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('width'),
            sidebar
        );
        expect(sidebarWidth).toBe('100%');
    });

    test('should handle theme switching', async () => {
        await page.goto('http://localhost:3000');
        
        // Click theme toggle button
        await page.click('#toggle-theme');
        
        // Check if body has light-mode class
        const hasLightMode = await page.evaluate(() => 
            document.body.classList.contains('light-mode')
        );
        expect(hasLightMode).toBeTruthy();
    });

    test('should show loading states', async () => {
        await page.goto('http://localhost:3000');
        
        // Trigger a message load
        await page.evaluate(() => {
            socket.emit('load-messages', { groupId: 'test-group' });
        });
        
        // Check if loading indicator is visible
        const loadingIndicator = await page.$('.loading-indicator');
        const isVisible = await page.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('display') !== 'none',
            loadingIndicator
        );
        expect(isVisible).toBeTruthy();
    });

    test('should display file preview', async () => {
        await page.goto('http://localhost:3000');
        
        // Simulate file selection
        await page.evaluate(() => {
            const file = new File(['test'], 'test.txt', { type: 'text/plain' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            document.getElementById('file-input').files = dataTransfer.files;
            document.getElementById('file-input').dispatchEvent(new Event('change'));
        });
        
        // Check if preview area is visible
        const previewArea = await page.$('#preview-area');
        const isVisible = await page.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('display') !== 'none',
            previewArea
        );
        expect(isVisible).toBeTruthy();
    });

    test('should handle message interactions', async () => {
        await page.goto('http://localhost:3000');
        
        // Send a test message
        await page.type('#message-input', 'Test message');
        await page.click('#send-button');
        
        // Check if message actions appear on hover
        await page.hover('.message');
        const actionsMenu = await page.$('.message-actions');
        const isVisible = await page.evaluate(el => 
            window.getComputedStyle(el).getPropertyValue('display') === 'flex',
            actionsMenu
        );
        expect(isVisible).toBeTruthy();
    });
});