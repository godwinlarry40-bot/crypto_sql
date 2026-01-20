document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('creditCardForm');
    const successMessage = document.getElementById('deposit-success');
    const submitBtn = form.querySelector('.submit-btn');

    // Area of change: Global Axios Interceptor
    // Automatically attaches the token so the server knows which wallet to credit
    axios.interceptors.request.use((config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Area of change: Data Payload for Credit Card API
            const formData = {
                cardNumber: document.getElementById('card-number').value.replace(/\s/g, ''),
                expiry: document.getElementById('expiry-date').value,
                cvv: document.getElementById('cvv').value,
                cardholder: document.getElementById('cardholder-name').value,
                amount: parseFloat(document.getElementById('amount').value)
            };

            // Area of change: UI Loading State
            submitBtn.disabled = true;
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';

            try {
                // Area of change: Live API Integration (Grey Query)
                const response = await axios.post('http://localhost:5000/api/wallets/deposit/credit', formData);

                if (response.data.success) {
                    successMessage.style.display = 'block';
                    successMessage.style.backgroundColor = 'var(--success)';
                    successMessage.textContent = response.data.message || 'Deposit successful!';
                    form.reset();
                }
            } catch (error) {
                // Area of change: Detailed Error Handling
                console.error("Deposit Error:", error.response?.data);
                successMessage.style.display = 'block';
                successMessage.style.backgroundColor = 'var(--danger)';
                successMessage.textContent = error.response?.data?.message || 'Transaction declined. Please check card details.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                
                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 5000);
            }
        });
    }

    // Format card number input (1234 5678...)
    const cardNumberInput = document.getElementById('card-number');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', function() {
            let value = this.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = '';
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) formattedValue += ' ';
                formattedValue += value[i];
            }
            this.value = formattedValue;
        });
    }

    // Format expiry date input (MM/YY)
    const expiryDateInput = document.getElementById('expiry-date');
    if (expiryDateInput) {
        expiryDateInput.addEventListener('input', function() {
            let value = this.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            if (value.length >= 2) {
                this.value = value.substring(0, 2) + '/' + value.substring(2, 4);
            } else {
                this.value = value;
            }
        });
    }
});$(document).ready(function() {
    const $form = $('#creditCardForm');
    const $successMessage = $('#deposit-success');
    const $submitBtn = $form.find('.submit-btn');

    // Area of change: jQuery Global AJAX Setup (Replaces Axios Interceptor)
    // Automatically attaches the JWT token from localStorage to every request
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
            const formData = {
                cardNumber: $('#card-number').val().replace(/\s/g, ''),
                expiry: $('#expiry-date').val(),
                cvv: $('#cvv').val(),
                cardholder: $('#cardholder-name').val(),
                amount: parseFloat($('#amount').val())
            };

            // Area of change: UI Loading State
            $submitBtn.prop('disabled', true);
            const originalText = $submitBtn.html();
            $submitBtn.html('<i class="fas fa-circle-notch fa-spin"></i> Processing...');

            // Area of change: jQuery AJAX Post Request
            $.ajax({
                url: 'http://localhost:5000/api/wallets/deposit/credit',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(formData),
                success: function(response) {
                    if (response.success) {
                        $successMessage.show()
                            .css('background-color', 'var(--success)')
                            .text(response.message || 'Deposit successful!');
                        $form[0].reset();
                    }
                },
                error: function(xhr) {
                    // Area of change: Detailed Error Handling for 401, 400, or 500
                    const errorData = xhr.responseJSON;
                    console.error("Deposit Error:", errorData);
                    
                    $successMessage.show()
                        .css('background-color', 'var(--danger)')
                        .text(errorData?.message || 'Transaction declined. Please check card details.');
                },
                complete: function() {
                    // Area of change: Re-enabling the UI
                    $submitBtn.prop('disabled', false);
                    $submitBtn.html(originalText);
                    
                    setTimeout(() => {
                        $successMessage.fadeOut();
                    }, 5000);
                }
            });
        });
    }

    // --- Input Formatting (Converted to jQuery) ---

    // Format card number input (1234 5678...)
    $('#card-number').on('input', function() {
        let value = $(this).val().replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        let formattedValue = '';
        for (let i = 0; i < value.length; i++) {
            if (i > 0 && i % 4 === 0) formattedValue += ' ';
            formattedValue += value[i];
        }
        $(this).val(formattedValue);
    });

    // Format expiry date input (MM/YY)
    $('#expiry-date').on('input', function() {
        let value = $(this).val().replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        if (value.length >= 2) {
            $(this).val(value.substring(0, 2) + '/' + value.substring(2, 4));
        } else {
            $(this).val(value);
        }
    });
});