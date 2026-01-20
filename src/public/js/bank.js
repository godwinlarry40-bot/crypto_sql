$(document).ready(function() {
    const $form = $('#bankTransferForm');
    const $successMessage = $('#transfer-success');
    const $submitBtn = $form.find('.submit-btn');

    // Area of change: jQuery Global AJAX Setup (Replaces Axios Interceptor)
    // This attaches the JWT token to every outgoing request automatically
    $.ajaxSetup({
        beforeSend: function(xhr) {
            const token = localStorage.getItem('token');
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
        }
    });

    if ($form.length) {
        $form.on('submit', function(e) {
            e.preventDefault();

            // Area of change: Data Collection using jQuery
            const bankData = {
                bankName: $('#bank-name').val(),
                accountNumber: $('#account-number').val(),
                routingNumber: $('#routing-number').val(),
                amount: parseFloat($('#transfer-amount').val())
            };

            // Area of change: UI Loading State
            $submitBtn.prop('disabled', true);
            const originalBtnText = $submitBtn.html();
            $submitBtn.html('<i class="fas fa-spinner fa-spin"></i> Processing...');

            // Area of change: jQuery AJAX Post Request
            $.ajax({
                url: 'http://localhost:5000/api/wallets/transfer',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(bankData),
                success: function(response) {
                    // Success UI Feedback
                    $successMessage.show()
                        .css('background-color', 'var(--success)')
                        .text(response.message || 'Transfer initiated successfully!');
                    
                    $form[0].reset(); // Reset form using native JS reset
                },
                error: function(xhr) {
                    // Area of change: jQuery Error Handling (401, 400, 500)
                    const errorResponse = xhr.responseJSON;
                    console.error("Transfer Error:", errorResponse);

                    $successMessage.show()
                        .css('background-color', 'var(--danger)')
                        .text(errorResponse?.message || 'Transfer failed. Please check your balance.');
                },
                complete: function() {
                    // Area of change: Re-enabling the UI
                    $submitBtn.prop('disabled', false);
                    $submitBtn.html(originalBtnText);

                    setTimeout(() => {
                        $successMessage.fadeOut();
                    }, 5000);
                }
            });
        });
    }
});