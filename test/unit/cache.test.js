const { expect } = require('chai');
const MessageCache = require('../../models/messageCache');

describe('Message Cache', () => {
    let cache;

    beforeEach(() => {
        cache = new MessageCache(3); // Small size for testing
    });

    it('should store and retrieve messages', () => {
        const message = {
            id: '1',
            text: 'test',
            timestamp: new Date()
        };
        cache.set('group1', message);
        expect(cache.get('group1', '1')).to.deep.equal(message);
    });

    it('should handle LRU eviction', () => {
        const messages = [
            { id: '1', timestamp: new Date() },
            { id: '2', timestamp: new Date() },
            { id: '3', timestamp: new Date() },
            { id: '4', timestamp: new Date() }
        ];

        messages.forEach(msg => cache.set('group1', msg));
        expect(cache.get('group1', '1')).to.be.null;
        expect(cache.get('group1', '4')).to.deep.equal(messages[3]);
    });

    it('should get group messages', () => {
        const messages = [
            { id: '1', text: 'test1', timestamp: Date.now() - 2000 },
            { id: '2', text: 'test2', timestamp: Date.now() - 1000 },
            { id: '3', text: 'test3', timestamp: Date.now() }
        ];
        cache.set('group1', messages);
        
        const result = cache.getGroupMessages('group1');
        expect(result).to.have.lengthOf(3);
    });

    it('should invalidate group cache', () => {
        const message = { id: '1', text: 'test', timestamp: new Date() };
        cache.set('group1', message);
        cache.invalidate('group1');
        expect(cache.get('group1', '1')).to.be.null;
    });

    it('should handle message updates', () => {
        const message = { id: '1', text: 'original', timestamp: new Date() };
        cache.set('group1', message);
        
        cache.set('group1', { ...message, text: 'updated' });
        const updated = cache.get('group1', '1');
        expect(updated.text).to.equal('updated');
    });
});
