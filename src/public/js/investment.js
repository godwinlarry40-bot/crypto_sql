$(document).ready(() => {
    // Area of change: jQuery selectors for backdrop and content
    const $backdrop = $('#modalBackdrop');
    const $content = $('#modalContent');
    
    // Area of change: Centralized Modal logic using jQuery effects
    window.showModal = (html) => {
        $content.html(html);
        $backdrop.fadeIn(200).css('display', 'flex'); // Smooth fade in
    };

    window.closeModal = () => {
        $backdrop.fadeOut(200, () => {
            $content.empty();
        });
    };

    // Area of change: Click listener for backdrop closing
    $backdrop.on('click', (e) => { 
        if ($(e.target).is($backdrop)) closeModal(); 
    });

    // Terms and Risk Content
    const TERMS_HTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 style="margin:0; color: var(--primary)"><i class="fas fa-file-contract"></i> Terms & Conditions</h2>
            <button class="secondary" onclick="closeModal()">Close</button>
        </div>
        <p class="small muted">Last updated: ${new Date().toLocaleDateString()}</p>
        <div class="small" style="margin-top:8px;line-height:1.45">
            <strong>1. Acceptance:</strong> By using TradePro investment services you agree to these terms.<br>
            <strong>2. No Guarantees:</strong> TradePro does not guarantee returns. Crypto asset values may rise or fall.<br>
            <strong>3. Fees:</strong> Management and performance fees apply as disclosed.<br>
            <strong>4. Risk:</strong> You should only invest amounts you can afford to lose.
        </div>`;

    const RISK_HTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 style="margin:0; color: var(--primary)"><i class="fas fa-exclamation-triangle"></i> Risk Disclosure</h2>
            <button class="secondary" onclick="closeModal()">Close</button>
        </div>
        <div class="small" style="margin-top:8px;line-height:1.45">
            <ul>
                <li>Market volatility: Prices can move rapidly.</li>
                <li>Liquidity risk: Some assets may be hard to sell quickly.</li>
                <li>Regulatory risk: Laws may change in your jurisdiction.</li>
            </ul>
        </div>`;

    $('#view-terms').on('click', () => showModal(TERMS_HTML));
    $('#view-risk').on('click', () => showModal(RISK_HTML));

    // Area of change: Refactored calculate to return netFinal for use in the investment flow
    const calculate = () => {
        const plan = $('#planSelect').val();
        const duration = Number($('#duration').val());
        const amount = Number($('#amount').val());
        const annualReturn = Number($('#returnP').val()) / 100;
        const compound = $('#compound').val();

        let years = duration / 365;
        let estFinal = 0;

        if (compound === 'none') {
            estFinal = amount * (1 + annualReturn * years);
        } else {
            let n = { monthly: 12, quarterly: 4, yearly: 1 }[compound];
            estFinal = amount * Math.pow(1 + (annualReturn / n), (n * years));
        }

        const mgmtRates = { short: 0.015, mid: 0.01, long: 0.0075 };
        const perfRates = { short: 0.10, mid: 0.12, long: 0.15 };
        
        const mgmtFeeAmount = amount * (mgmtRates[plan] * years);
        const grossProfit = estFinal - amount;
        const perfFee = grossProfit > 0 ? perfRates[plan] * grossProfit : 0;
        const netFinal = estFinal - perfFee - mgmtFeeAmount;

        $('#results').slideDown();
        $('#estText').html(`
            Plan: <strong>${plan.toUpperCase()}</strong> • Duration: <strong>${duration} days</strong><br>
            Estimated Gross: <strong>$${estFinal.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong><br>
            Management Fee: <strong>$${mgmtFeeAmount.toFixed(2)}</strong> • Performance Fee: <strong>$${perfFee.toFixed(2)}</strong><br>
            <strong>Estimated Net Outcome</strong>: <strong>$${netFinal.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`);
        
        return { amount, plan };
    };

    $('#calc').on('click', calculate);
    
    // Area of change: Correlated Plan mapping with constants.js IDs (1, 2, 3)
    $(document).on('click', '[data-plan]', function() {
        const planType = $(this).data('plan'); // 'short', 'mid', or 'long' from HTML
        const amount = $('#amount').val() || 1000; 
        
        /**
         * Area of change: Map UI plan types to Database Plan IDs 
         * short -> Starter (ID 1)
         * mid   -> Professional (ID 2)
         * long  -> Enterprise (ID 3)
         */
        const planIdMap = { 'short': 1, 'mid': 2, 'long': 3 };
        const selectedPlanId = planIdMap[planType];

        showModal(`
            <div style="display:flex;justify-content:space-between;align-items:center"> 
                <h2 style="margin:0; color: var(--primary)"><i class="fas fa-check-circle"></i> Confirm Investment</h2>
                <button class="secondary" onclick="closeModal()">Close</button>
            </div>
            <p class="small" style="margin-top:15px">You are about to invest <strong>$${amount}</strong> into the <strong>${planType.toUpperCase()}</strong> plan.</p>
            <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn" id="executeInvestment">Confirm & Invest Now</button>
                <button class="secondary" onclick="closeModal()">Cancel</button>
            </div>
            <div id="investFeedback" class="small" style="margin-top:10px; display:none"></div>
        `);

        // Handle the actual AJAX call to your backend
        $('#executeInvestment').on('click', function() {
            const $btn = $(this);
            const $feedback = $('#investFeedback');
            
            $btn.prop('disabled', true).text('Processing...');
            $feedback.hide().removeClass('error success');

            $.ajax({
                url: '/api/investments',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    planId: selectedPlanId, // Area of change: Sending the integer ID
                    amount: Number(amount),
                    currency: 'USDT', // Area of change: Correlated with constants.js DEFAULT_CURRENCY
                    autoRenew: false
                }),
                success: function(response) {
                    if (response.success) {
                        $feedback.addClass('success').css('color', 'green').text('Investment successful! Redirecting...').show();
                        setTimeout(() => window.location.href = '/dashboard', 1500);
                    } else {
                        $btn.prop('disabled', false).text('Confirm & Invest Now');
                        $feedback.addClass('error').css('color', 'red').text(response.message).show();
                    }
                },
                error: function(xhr) {
                    $btn.prop('disabled', false).text('Confirm & Invest Now');
                    const errorMsg = xhr.responseJSON ? xhr.responseJSON.message : 'Connection failed';
                    $feedback.css('color', 'red').text('Error: ' + errorMsg).show();
                }
            });
        });
    });

    $(window).on('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
});