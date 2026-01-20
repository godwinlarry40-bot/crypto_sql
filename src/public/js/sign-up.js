// Area of change: Use relative paths to prevent CORS issues in production
const REGISTER_ENDPOINT = '/api/auth/register';

$(document).ready(function() {
    // Area of change: jQuery selection for primary elements
    const $signupForm = $('#signupForm');
    const $submitBtn = $('#submitBtn');
    const $formError = $('#form-error');
    const $successMessage = $('#signup-success');

    // Form validation
    function validateForm() {
        let isValid = true;
        clearErrors();
        
        const firstName = $('#firstName').val().trim();
        const lastName = $('#lastName').val().trim();
        const email = $('#email').val().trim();
        const phone = $('#phone').val().trim(); // Added check for phone
        const password = $('#password').val();
        const confirmPassword = $('#confirmPassword').val();
        const terms = $('#terms').is(':checked');
        
        // Area of change: Validation logic using jQuery
        if (!firstName) { showError('firstName', 'First name is required'); isValid = false; }
        if (!lastName) { showError('lastName', 'Last name is required'); isValid = false; }
        if (!phone) { showError('phone', 'Phone number is required'); isValid = false; }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) { showError('email', 'Please enter a valid email'); isValid = false; }
        
        if (password.length < 8) { showError('password', 'Password must be at least 8 characters'); isValid = false; }
        if (password !== confirmPassword) { showError('confirmPassword', 'Passwords do not match'); isValid = false; }
        if (!terms) { showError('terms', 'You must agree to the terms'); isValid = false; }
        
        return isValid;
    }

    // Area of change: Simplified error display with jQuery selectors
    function showError(fieldId, message) {
        const $err = $(`#${fieldId}-error`);
        $err.text(message).show();
    }

    function clearErrors() {
        $('.field-error').text('').hide();
        $formError.text('').hide();
    }

    function showFormError(message) {
        $formError.text(message).show();
    }

    // Form submission handler
    $signupForm.on('submit', async function(event) {
        event.preventDefault();
        
        if (!validateForm()) return;
        
        // Area of change: Ensure keys match exactly what your Backend authController expects
        const formData = {
            firstName: $('#firstName').val().trim(),
            lastName: $('#lastName').val().trim(),
            email: $('#email').val().trim().toLowerCase(),
            phone: $('#phone').val().trim(), // Matches common backend naming
            password: $('#password').val(),
            referralCode: $('#referralCode').val()?.trim() || ''
        };
        
        setLoading(true);
        
        try {
            // Area of change: Using Axios to POST to the endpoint
            const response = await axios.post(REGISTER_ENDPOINT, formData);
            
            if (response.data.success) {
                $successMessage.text("Account created! Please check your email for verification.").show();
                $signupForm[0].reset(); // Area of change: Native reset on the DOM element
                
                // Area of change: Save token and redirect after 3 seconds to allow user to read success message
                if (response.data.data?.token) {
                    localStorage.setItem('token', response.data.data.token);
                    localStorage.setItem('user', JSON.stringify(response.data.data.user));
                }
                
                setTimeout(() => { 
                    window.location.href = '/signin'; 
                }, 3000);
            }
        } catch (error) {
            console.error('Registration Error:', error);
            
            if (error.response) {
                const serverData = error.response.data;
                // Area of change: Specific error handling for duplicate emails or validation errors
                showFormError(serverData.message || 'Registration failed');
                
                if (serverData.errors) {
                    Object.keys(serverData.errors).forEach(key => {
                        showError(key, serverData.errors[key]);
                    });
                }
            } else {
                showFormError('Connection to server failed. Please check your internet.');
            }
        } finally {
            setLoading(false);
        }
    });

    // Area of change: loading state handled via jQuery toggle/prop
    function setLoading(isLoading) {
        $submitBtn.prop('disabled', isLoading);
        // Toggle visibility of button text and spinner
        if (isLoading) {
            $submitBtn.find('.btn-text').css('opacity', '0');
            $submitBtn.find('.btn-loader').fadeIn();
        } else {
            $submitBtn.find('.btn-text').css('opacity', '1');
            $submitBtn.find('.btn-loader').fadeOut();
        }
    }

    // Area of change: jQuery Password Visibility Toggle
    $('#togglePassword').on('click', function() {
        const $passInput = $('#password');
        const isPass = $passInput.attr('type') === 'password';
        $passInput.attr('type', isPass ? 'text' : 'password');
        $(this).find('i').toggleClass('fa-eye fa-eye-slash');
    });
});