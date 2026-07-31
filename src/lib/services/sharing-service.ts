import { ShareableTransaction, ShareSettings } from '@shared/types/sharing';

export class SharingService {
  async createShareLink(
    transactionId: string,
    userAddress: string,
    settings: ShareSettings,
  ): Promise<ShareableTransaction> {
    const shareToken = this.generateShareToken();
    const id = `share_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const share: ShareableTransaction = {
      id,
      transactionId,
      shareToken,
      userAddress,
      isPublic: settings.allowSharing,
      createdAt: Date.now(),
      expiresAt: settings.expirationDays
        ? Date.now() + settings.expirationDays * 24 * 60 * 60 * 1000
        : undefined,
      viewCount: 0,
    };

    // TODO: Persist to database
    return share;
  }

  async getShareLink(shareToken: string): Promise<ShareableTransaction | null> {
    // TODO: Fetch from database
    return null;
  }

  async incrementViewCount(shareToken: string): Promise<void> {
    // TODO: Update view count in database
  }

  async revokeShareLink(shareToken: string): Promise<void> {
    // TODO: Delete from database
  }

  async getUserShareLinks(userAddress: string): Promise<ShareableTransaction[]> {
    // TODO: Fetch from database
    return [];
  }

  private generateShareToken(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  generateShareUrl(shareToken: string, baseUrl: string): string {
    return `${baseUrl}/share/${shareToken}`;
  }

  generateSocialShareText(amount: string, currency: string): string {
    return `I just completed a transaction of ${amount} ${currency} using Stellar-Spend! 🚀`;
  }

  generateTwitterShareUrl(shareUrl: string, text: string): string {
    const encoded = encodeURIComponent(`${text}\n${shareUrl}`);
    return `https://twitter.com/intent/tweet?text=${encoded}`;
  }

  generateFacebookShareUrl(shareUrl: string): string {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  }

  generateLinkedInShareUrl(shareUrl: string, title: string): string {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`;
  }

  generateEmailShareUrl(shareUrl: string, amount: string, currency: string): string {
    const subject = encodeURIComponent(`Check out my Stellar-Spend transaction`);
    const body = encodeURIComponent(
      `I just completed a transaction of ${amount} ${currency}.\n\nView details: ${shareUrl}`,
    );
    return `mailto:?subject=${subject}&body=${body}`;
  }
}
