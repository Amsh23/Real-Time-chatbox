const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const ivLength = 16;
const saltLength = 64;
const tagLength = 16;
const keyLength = 32;
const digest = 'sha256';

// Generate an encryption key from a password/secret
const getKey = (password, salt) => {
    return crypto.pbkdf2Sync(password, salt, 100000, keyLength, digest);
};

// Encrypt a message
const encrypt = (text, secret) => {
    try {
        const salt = crypto.randomBytes(saltLength);
        const iv = crypto.randomBytes(ivLength);
        const key = getKey(secret, salt);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        const encrypted = Buffer.concat([
            cipher.update(String(text), 'utf8'),
            cipher.final()
        ]);
        
        const tag = cipher.getAuthTag();

        // Return everything we need to decrypt later
        return Buffer.concat([
            salt,
            iv,
            tag,
            encrypted
        ]).toString('base64');
    } catch (err) {
        console.error('Encryption error:', err);
        return null;
    }
};

// Decrypt a message
const decrypt = (encryptedData, secret) => {
    try {
        const inputData = Buffer.from(encryptedData, 'base64');

        // Extract the pieces needed for decryption
        const salt = inputData.slice(0, saltLength);
        const iv = inputData.slice(saltLength, saltLength + ivLength);
        const tag = inputData.slice(saltLength + ivLength, saltLength + ivLength + tagLength);
        const encrypted = inputData.slice(saltLength + ivLength + tagLength);
        
        const key = getKey(secret, salt);
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        
        decipher.setAuthTag(tag);
        
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        return decrypted.toString('utf8');
    } catch (err) {
        console.error('Decryption error:', err);
        return null;
    }
};

// Generate a unique room key for group encryption
const generateRoomKey = () => {
    return crypto.randomBytes(32).toString('base64');
};

module.exports = {
    encrypt,
    decrypt,
    generateRoomKey
};