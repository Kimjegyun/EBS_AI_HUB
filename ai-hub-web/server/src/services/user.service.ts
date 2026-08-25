import { run, get, all } from '../config/database';

export class UserService {
  async getUsers() {
    return await all('SELECT id, email, login_id, name, role, status, company, department, created_at FROM users');
  }

  async getUserById(id: string) {
    return await get('SELECT id, email, login_id, name, role, status, company, department, created_at FROM users WHERE id = ?', [id]);
  }

  async updateUser(id: string, data: any) {
    await run(
      'UPDATE users SET name = ?, company = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [data.name, data.company, data.department, id]
    );
    return await this.getUserById(id);
  }

  async deleteUser(id: string) {
    await run('DELETE FROM users WHERE id = ?', [id]);
    return { message: 'User deleted successfully' };
  }

  async approveUser(id: string) {
    await run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['approved', id]);
    return await this.getUserById(id);
  }

  async rejectUser(id: string) {
    await run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['rejected', id]);
    return await this.getUserById(id);
  }
}

// Made with Bob
