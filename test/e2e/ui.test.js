const puppeteer = require('puppeteer');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const initializeSocketHandlers = require('../../handlers/socket');

describe('UI and Responsiveness Tests', () => {
    let browser;
    let page;
    let server;
    let port;

    beforeAll(async () => {
        // Start server
        const app = express();
        app.use(express.static(path.join(__dirname, '../../public')));
        server = createServer(app);
        const io = new Server(server);
        initializeSocketHandlers(io, new Map(), new Map());
        
        await new Promise(resolve => {
            server.listen(0, () => {
                port = server.address().port;
                resolve();
            });
        });

        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox']
        });
    }, 30000);

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    afterAll(async () => {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    });

    test('should render correctly on mobile devices', async () => {
        // Set mobile viewport
        await page.setViewport({
            width: 375,
            height: 812,
            isMobile: true
        });

        await page.goto(`http://localhost:${port}`);

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
        await page.goto(`http://localhost:${port}`);
        
        // Click theme toggle button
        await page.click('#toggle-theme');
        
        // Check if body has light-mode class
        const hasLightMode = await page.evaluate(() => 
            document.body.classList.contains('light-mode')
        );
        expect(hasLightMode).toBeTruthy();
    });

    test('should show loading states', async () => {
        await page.goto(`http://localhost:${port}`);
        
        // Trigger a message load
        await page.evaluate(() => {
            window.socket.emit('load-messages', { groupId: 'test-group' });
        });
        
        // Wait for and check loading indicator
        await page.waitForSelector('.loading-indicator', { visible: true });
        const isVisible = await page.evaluate(() => {
            const el = document.querySelector('.loading-indicator');
            return window.getComputedStyle(el).display !== 'none';
        });
        expect(isVisible).toBeTruthy();
    });

    test('should display file preview', async () => {
        await page.goto(`http://localhost:${port}`);
        
        // Create a file and trigger the file input
        await page.evaluate(() => {
            const file = new File(['test'], 'test.txt', { type: 'text/plain' });
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            document.getElementById('file-input').files = dataTransfer.files;
            document.getElementById('file-input').dispatchEvent(new Event('change'));
        });
        
        // Wait for and check preview area
        await page.waitForSelector('#preview-area', { visible: true });
        const isVisible = await page.evaluate(() => {
            const el = document.getElementById('preview-area');
            return window.getComputedStyle(el).display !== 'none';
        });
        expect(isVisible).toBeTruthy();
    });

    test('should handle message interactions', async () => {
        await page.goto(`http://localhost:${port}`);
        
        // Set up a username first
        await page.type('#username-input', 'TestUser');
        await page.click('#save-username');
        
        // Send a test message
        await page.type('#message-input', 'Test message');
        await page.click('#send-button');
        
        // Wait for message to appear
        await page.waitForSelector('.message');
        
        // Check if message actions appear on hover
        await page.hover('.message');
        const actionsMenu = await page.waitForSelector('.message-actions');
        const isVisible = await page.evaluate(el => 
            window.getComputedStyle(el).display === 'flex',
            actionsMenu
        );
        expect(isVisible).toBeTruthy();
    });
});