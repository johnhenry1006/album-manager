export function publicUser(user) {
    return { id: user.id, email: user.email };
}
export function publicSession(session) {
    return { user: publicUser(session.user), csrfToken: session.csrfToken };
}
