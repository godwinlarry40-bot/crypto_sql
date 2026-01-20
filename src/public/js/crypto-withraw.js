$(document).ready(function() {
    // Area of change: jQuery Global AJAX Setup (Replaces Axios Interceptor)
    $.ajaxSetup({
        beforeSend: function(xhr) {
            const token = localStorage.getItem('token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
        }
    });

    // DOM Elements using jQuery
    const $form = $('#withdrawalForm');
    const $cryptoOptions = $('.crypto-option');
    const $cryptoTypeInput = $('#crypto-type');
    const $walletAddressInput = $('#wallet-address');
    const $withdrawalAmountInput = $('#withdrawal-amount');
    const $availableBalanceSpan = $('#available-balance');
    const $usdBalanceSpan = $('#usd-balance');
    const $networkFeeSpan = $('#network-fee');
    const $receiveAmountSpan = $('#receive-amount');
    const $submitBtn = $('#submit-btn');
    const $confirmationModal = $('#confirmation-modal');
    const $cancelWithdrawalBtn = $('#cancel-withdrawal');
    const $confirmWithdrawalBtn = $('#confirm-withdrawal');
    const $successMessage = $('#withdrawal-success');
    
    // Crypto data
    const cryptoData = {
        'BTC': {
            name: 'Bitcoin',
            balance: 0.000,
            fee: 0.00050000,
            icon: '<i class="fab fa-bitcoin"></i>',
            usdRate: 45000
        },
        'ETH': {
            name: 'Ethereum',
            balance: 0.000,
            fee: 0.00500000,
            icon: '<i class="fab fa-ethereum"></i>',
            usdRate: 3000
        },
        'USDT': {
            name: 'Tether',
            balance: 0.000,
            fee: 1.00000000,
            icon: '<i class="fas fa-coins"></i>',
            usdRate: 1
        }
    };
    
    let selectedCrypto = 'BTC';
    updateCryptoData();
    
    // Area of change: Event Handling with jQuery
    $cryptoOptions.on('click', function() {
        $cryptoOptions.removeClass('active');
        $(this).addClass('active');
        selectedCrypto = $(this).data('crypto');
        $cryptoTypeInput.val(selectedCrypto);
        updateCryptoData();
    });
    
    $withdrawalAmountInput.on('input', function() {
        updateReceiveAmount();
        validateForm();
    });
    
    $walletAddressInput.on('input', validateForm);
    
    $form.on('submit', function(e) {
        e.preventDefault();
        showConfirmationModal();
    });
    
    $cancelWithdrawalBtn.on('click', function() {
        $confirmationModal.fadeOut(200);
    });
    
    $confirmWithdrawalBtn.on('click', function() {
        processWithdrawal();
    });
    
    function updateCryptoData() {
        const crypto = cryptoData[selectedCrypto];
        $availableBalanceSpan.text(`${crypto.balance.toFixed(8)} ${selectedCrypto}`);
        $usdBalanceSpan.text(`$${(crypto.balance * crypto.usdRate).toFixed(2)}`);
        $networkFeeSpan.text(`${crypto.fee.toFixed(8)} ${selectedCrypto}`);
        $withdrawalAmountInput.val('');
        $withdrawalAmountInput.attr('placeholder', `0.00000000 ${selectedCrypto}`);
        updateReceiveAmount();
        validateForm();
    }
    
    function updateReceiveAmount() {
        const crypto = cryptoData[selectedCrypto];
        const amount = parseFloat($withdrawalAmountInput.val()) || 0;
        const fee = crypto.fee;
        if (amount > 0) {
            const receiveAmount = amount - fee;
            $receiveAmountSpan.text(`${receiveAmount > 0 ? receiveAmount.toFixed(8) : '0.00000000'} ${selectedCrypto}`);
        } else {
            $receiveAmountSpan.text(`0.00000000 ${selectedCrypto}`);
        }
    }
    
    function validateForm() {
        const crypto = cryptoData[selectedCrypto];
        const amount = parseFloat($withdrawalAmountInput.val()) || 0;
        const walletAddress = $walletAddressInput.val().trim();
        const isValidAddress = walletAddress.length > 10;
        const isValidAmount = amount > 0 && amount <= crypto.balance && amount > crypto.fee;
        $submitBtn.prop('disabled', !(isValidAddress && isValidAmount));
    }
    
    function showConfirmationModal() {
        const crypto = cryptoData[selectedCrypto];
        const amount = parseFloat($withdrawalAmountInput.val()) || 0;
        const walletAddress = $walletAddressInput.val().trim();
        const fee = crypto.fee;
        const receiveAmount = amount - fee;
        
        $('#confirm-crypto').text(selectedCrypto);
        $('#confirm-amount').text(`${amount.toFixed(8)} ${selectedCrypto}`);
        $('#confirm-fee').text(`${fee.toFixed(8)} ${selectedCrypto}`);
        $('#confirm-receive').text(`${receiveAmount.toFixed(8)} ${selectedCrypto}`);
        $('#confirm-address').text(walletAddress);
        
        $confirmationModal.css('display', 'flex').hide().fadeIn(200);
    }
    
    // Area of change: Integrated processWithdrawal with jQuery $.ajax
    async function processWithdrawal() {
        const payload = {
            cryptoType: selectedCrypto,
            amount: parseFloat($withdrawalAmountInput.val()),
            walletAddress: $walletAddressInput.val().trim(),
            fee: cryptoData[selectedCrypto].fee
        };

        // UI Loading state
        $confirmWithdrawalBtn.prop('disabled', true);
        $confirmWithdrawalBtn.html('<i class="fas fa-spinner fa-spin"></i> Processing...');

        $.ajax({
            url: 'http://localhost:5000/api/wallets/withdraw/crypto',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function(response) {
                if (response.success) {
                    $successMessage.css({
                        'background-color': 'var(--success)',
                        'display': 'block'
                    }).text(response.message || 'Withdrawal processed successfully!');
                    $form[0].reset();
                    updateCryptoData();
                }
            },
            error: function(xhr) {
                // Area of change: Error handling for failed API requests
                const errorData = xhr.responseJSON;
                console.error("Withdrawal Error:", errorData);
                $successMessage.css({
                    'background-color': 'var(--danger)',
                    'display': 'block'
                }).text(errorData?.message || 'Transaction failed. Please try again.');
            },
            complete: function() {
                $confirmWithdrawalBtn.prop('disabled', false).text('Confirm Withdrawal');
                $confirmationModal.fadeOut(200);
                
                setTimeout(() => {
                    $successMessage.fadeOut();
                }, 5000);
            }
        });
    }
});