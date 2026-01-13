const user = JSON.parse(localStorage.getItem('loggedUser'));
document.getElementById('user-role').textContent = `${user.user_firstName} ${user.user_lastName}`;