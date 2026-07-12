'use strict';

/**
 * Commission Service
 *
 * Handles:
 *   • Direct partner commissions
 *   • Upline commissions
 */

const { db } = require('../utils/firebase');
const {
    requireFields,
    validateAmount
} = require('../utils/validators');

const { logAudit } = require('./audit');

const PIN_PRICE = 850;

/**
 * Write commission after successful pin generation.
 */
async function writeCommission(
    school,
    data,
    userEmail
) {

    requireFields(data, [
        'pinCount',
        'pinType'
    ]);

    const pinCount = validateAmount(data.pinCount);

    if (pinCount <= 0) {
        throw new Error(
            'Invalid pin quantity.'
        );
    }

    const marketerId =
        school.marketerId || null;

    if (!marketerId) {

        return {
            success: true,
            message:
                'No marketer attached to this school.'
        };

    }

    // Load partner

    const partnerSnap = await db
        .ref(`partners/${marketerId}`)
        .once('value');

    if (!partnerSnap.exists()) {

        return {
            success: true,
            message:
                'Partner record not found.'
        };

    }

    const partner = partnerSnap.val();

    const uplineId =
        partner.uplineId || null;

    const total =
        pinCount * PIN_PRICE;

    const directAmount =
        Math.round(total * 0.30);

    const now = Date.now();

    //──────────────────────────────────────────
    // DIRECT PARTNER
    //──────────────────────────────────────────

    const directRef = db.ref(
        `partnerEarnings/${marketerId}`
    );

    await directRef.transaction(current => {

        if (!current) {

            current = {

                balance: 0,

                totalEarned: 0

            };

        }

        current.balance =
            (current.balance || 0) +
            directAmount;

        current.totalEarned =
            (current.totalEarned || 0) +
            directAmount;

        current.lastActivity = now;

        return current;

    });

    await db
        .ref(
            `partnerTransactions/${marketerId}`
        )
        .push({

            type: 'commission_direct',

            amount: directAmount,

            schoolId: school.id,

            schoolName:
                school.schoolName || '',

            pinCount,

            pinType: data.pinType,

            timestamp: now

        });

    //──────────────────────────────────────────
    // UPLINE
    //──────────────────────────────────────────

    if (uplineId) {

        const uplineAmount =
            Math.round(total * 0.20);

        const uplineRef = db.ref(
            `partnerEarnings/${uplineId}`
        );

        await uplineRef.transaction(current => {

            if (!current) {

                current = {

                    balance: 0,

                    totalEarned: 0

                };

            }

            current.balance =
                (current.balance || 0) +
                uplineAmount;

            current.totalEarned =
                (current.totalEarned || 0) +
                uplineAmount;

            current.lastActivity = now;

            return current;

        });

        await db
            .ref(
                `partnerTransactions/${uplineId}`
            )
            .push({

                type:
                    'commission_network',

                amount:
                    uplineAmount,

                schoolId:
                    school.id,

                schoolName:
                    school.schoolName || '',

                pinCount,

                pinType:
                    data.pinType,

                referredPartnerId:
                    marketerId,

                timestamp:
                    now

            });

    }

    await logAudit(

        school.id,

        'Commission written',

        `${pinCount} ${data.pinType} pin(s)`,

        userEmail

    );

    return {

        success: true,

        directPartner:
            marketerId,

        uplinePartner:
            uplineId,

        totalCommission:
            directAmount +
            (uplineId
                ? Math.round(total * 0.20)
                : 0),

        message:
            'Commission processed successfully.'

    };

}

module.exports = {

    writeCommission

};