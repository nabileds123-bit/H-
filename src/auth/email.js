var nodemailer = require('nodemailer');

function getBaseUrl(req) {
    var configured = process.env.APP_BASE_URL;
    if (configured) return configured.replace(/\/$/, '');

    var proto = req.headers['x-forwarded-proto'] || 'http';
    return proto + '://' + req.headers.host;
}

function createTransporter() {
    if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
        port: parseInt(process.env.BREVO_SMTP_PORT || '587', 10),
        secure: process.env.BREVO_SMTP_SECURE === 'true',
        auth: {
            user: process.env.BREVO_SMTP_USER,
            pass: process.env.BREVO_SMTP_PASS
        }
    });
}

function sendMail(options, callback) {
    var transporter = createTransporter();
    var from = process.env.AUTH_EMAIL_FROM || process.env.BREVO_SMTP_USER;

    if (!transporter || !from) {
        console.log('[Auth] SMTP is not configured. Email skipped: %s', options.subject);
        if (options.debugLink) console.log('[Auth] Link: %s', options.debugLink);
        callback(null);
        return;
    }

    transporter.sendMail({
        from: from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
    }, callback);
}

function sendVerificationEmail(req, user, token, callback) {
    var link = getBaseUrl(req) + '/api/auth/verify-email?token=' + encodeURIComponent(token);

    sendMail({
        to: user.email,
        subject: 'Verify your Bubble.am account',
        debugLink: link,
        text: 'Verify your Bubble.am account: ' + link,
        html: '<p>Click this link to verify your Bubble.am account:</p><p><a href="' + link + '">' + link + '</a></p>'
    }, callback);
}

function sendResetPasswordEmail(req, user, token, callback) {
    var link = getBaseUrl(req) + '/client/?resetToken=' + encodeURIComponent(token);

    sendMail({
        to: user.email,
        subject: 'Reset your Bubble.am password',
        debugLink: link,
        text: 'Reset your Bubble.am password: ' + link,
        html: '<p>Click this link to reset your Bubble.am password:</p><p><a href="' + link + '">' + link + '</a></p>'
    }, callback);
}

module.exports = {
    sendResetPasswordEmail: sendResetPasswordEmail,
    sendVerificationEmail: sendVerificationEmail
};
