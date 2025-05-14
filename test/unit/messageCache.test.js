const { expect } = require('chai');
const { MessageCache } = require('../../handlers/socket/messageHandlers');

describe('MessageCache', () => {
    let cache;
    
    beforeEach(() => {
        cache = new MessageCache(3); // Small size for testing
    });

    describe('set', () => {
        it('should store single message', () => {
            const message = { id: '1', text: 'test', timestamp: Date.now() };
            cache.set('group1', message);
            expect(cache.get('group1', '1')).to.deep.equal(message);
        });

        it('should store multiple messages', () => {
            const messages = [
                { id: '1', text: 'test1', timestamp: Date.now() },
                { id: '2', text: 'test2', timestamp: Date.now() }
            ];
            cache.set('group1', messages);
            expect(cache.get('group1', '1')).to.deep.equal(messages[0]);
            expect(cache.get('group1', '2')).to.deep.equal(messages[1]);
        });

        it('should handle LRU eviction', () => {
            const messages = [
                { id: '1', text: 'test1', timestamp: Date.now() },
                { id: '2', text: 'test2', timestamp: Date.now() },
                { id: '3', text: 'test3', timestamp: Date.now() },
                { id: '4', text: 'test4', timestamp: Date.now() }
            ];
            
            messages.forEach(msg => cache.set('group1', msg));
            expect(cache.get('group1', '1')).to.be.null;
            expect(cache.get('group1', '4')).to.deep.equal(messages[3]);
        });
    });

    describe('getGroupMessages', () => {
        it('should return messages sorted by timestamp', () => {
            const messages = [
                { id: '1', text: 'test1', timestamp: Date.now() - 2000 },
                { id: '2', text: 'test2', timestamp: Date.now() - 1000 },
                { id: '3', text: 'test3', timestamp: Date.now() }
            ];
            cache.set('group1', messages);
            
            const result = cache.getGroupMessages('group1');
            expect(result).to.have.lengthOf(3);
            expect(result[0].id).to.equal('3');
        });

        it('should respect limit parameter', () => {
            const messages = [
                { id: '1', text: 'test1', timestamp: Date.now() - 2000 },
                { id: '2', text: 'test2', timestamp: Date.now() - 1000 },
                { id: '3', text: 'test3', timestamp: Date.now() }
            ];
            cache.set('group1', messages);
            
            const result = cache.getGroupMessages('group1', 2);
            expect(result).to.have.lengthOf(2);
        });
    });

    describe('cleanup', () => {
        it('should remove expired messages', () => {
            const now = Date.now();
            const messages = [
                { id: '1', text: 'old', timestamp: now - (25 * 60 * 60 * 1000) },
                { id: '2', text: 'new', timestamp: now }
            ];
            cache.set('group1', messages);
            
            cache.cleanup();
            expect(cache.get('group1', '1')).to.be.null;
            expect(cache.get('group1', '2')).to.deep.equal(messages[1]);
        });
    });

    describe('updateMessage', () => {
        it('should update existing message', () => {
            const message = { id: '1', text: 'original', timestamp: Date.now() };
            cache.set('group1', message);
            
            const updates = { text: 'updated' };
            const result = cache.updateMessage('group1', '1', updates);
            
            expect(result).to.be.true;
            expect(cache.get('group1', '1').text).to.equal('updated');
        });

        it('should return false for non-existent message', () => {
            const result = cache.updateMessage('group1', 'nonexistent', { text: 'test' });
            expect(result).to.be.false;
        });
    });
});
