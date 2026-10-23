use super::*;

impl Application {
    pub fn list_categories(
        &self,
        limit: Option<usize>,
        cursor: Option<String>,
    ) -> Result<Page<RefItem>> {
        let rows = self
            .core
            .categories()
            .list()?
            .into_iter()
            .map(RefItem::from)
            .collect();
        self.reference_page(rows, "categories", limit, cursor)
    }
    pub fn create_category(&self, name: String, color: String, icon: String) -> Result<RefItem> {
        check("name", validation::validate_name(&name, "name"))?;
        check("color", validation::validate_color(&color))?;
        check("icon", validation::validate_name(&icon, "icon"))?;
        Ok(self
            .core
            .categories()
            .create(core::NewCategory { name, color, icon })?
            .into())
    }
    pub fn update_category(
        &self,
        id: &str,
        name: Option<String>,
        color: Option<String>,
        icon: Option<String>,
    ) -> Result<RefItem> {
        require_change(name.is_some() || color.is_some() || icon.is_some())?;
        if let Some(name) = &name {
            check("name", validation::validate_name(name, "name"))?;
        }
        if let Some(color) = &color {
            check("color", validation::validate_color(color))?;
        }
        if let Some(icon) = &icon {
            check("icon", validation::validate_name(icon, "icon"))?;
        }
        let mut item: RefItem = self
            .core
            .categories()
            .update(id, core::UpdateCategory { name, color, icon })?
            .into();
        item.subscription_count = self
            .core
            .subscriptions()
            .list()
            .map_err(applied)?
            .iter()
            .filter(|row| row.category_id.as_deref() == Some(id))
            .count();
        Ok(item)
    }
    pub fn list_tags(&self, limit: Option<usize>, cursor: Option<String>) -> Result<Page<RefItem>> {
        let rows = self
            .core
            .tags()
            .list()?
            .into_iter()
            .map(RefItem::from)
            .collect();
        self.reference_page(rows, "tags", limit, cursor)
    }
    pub fn create_tag(&self, name: String, color: Option<String>) -> Result<RefItem> {
        check("name", validation::validate_name(&name, "name"))?;
        if let Some(color) = &color {
            check("color", validation::validate_color(color))?;
        }
        Ok(self
            .core
            .tags()
            .create(core::NewTag { name, color })?
            .into())
    }
    pub fn update_tag(
        &self,
        id: &str,
        name: Option<String>,
        color: Option<String>,
    ) -> Result<RefItem> {
        require_change(name.is_some() || color.is_some())?;
        if let Some(name) = &name {
            check("name", validation::validate_name(name, "name"))?;
        }
        if let Some(color) = &color {
            check("color", validation::validate_color(color))?;
        }
        let mut item: RefItem = self
            .core
            .tags()
            .update(id, core::UpdateTag { name, color })?
            .into();
        item.subscription_count = self
            .all_tag_links()
            .map_err(applied)?
            .iter()
            .filter(|link| link.tag_id == id)
            .count();
        Ok(item)
    }
    pub fn list_cards(
        &self,
        limit: Option<usize>,
        cursor: Option<String>,
    ) -> Result<Page<RefItem>> {
        let rows = self
            .core
            .payment_cards()
            .list()?
            .into_iter()
            .map(RefItem::from)
            .collect();
        self.reference_page(rows, "cards", limit, cursor)
    }
    pub fn create_card(&self, input: CreateCardInput) -> Result<RefItem> {
        check("name", validation::validate_name(&input.name, "name"))?;
        if let Some(last_four) = &input.last_four {
            check("last_four", validation::validate_last_four(last_four))?;
        }
        let color = input.color.unwrap_or_else(|| "#6b7280".into());
        check("color", validation::validate_color(&color))?;
        if let Some(limit) = input.credit_limit {
            check(
                "credit_limit",
                validation::validate_amount(limit, "credit_limit"),
            )?;
        }
        Ok(self
            .core
            .payment_cards()
            .create(core::NewPaymentCard {
                name: input.name,
                card_type: input.card_type,
                last_four: input.last_four,
                color,
                credit_limit: input.credit_limit,
            })?
            .into())
    }
    pub fn update_card(&self, id: &str, input: UpdateCardInput) -> Result<RefItem> {
        let clear_last = input.clear_fields.contains(&CardClearField::LastFour);
        let clear_limit = input.clear_fields.contains(&CardClearField::CreditLimit);
        set_clear("last_four", input.last_four.is_some(), clear_last)?;
        set_clear("credit_limit", input.credit_limit.is_some(), clear_limit)?;
        require_change(
            input.name.is_some()
                || input.card_type.is_some()
                || input.last_four.is_some()
                || input.color.is_some()
                || input.credit_limit.is_some()
                || !input.clear_fields.is_empty(),
        )?;
        if let Some(name) = &input.name {
            check("name", validation::validate_name(name, "name"))?;
        }
        if let Some(last_four) = &input.last_four {
            check("last_four", validation::validate_last_four(last_four))?;
        }
        if let Some(color) = &input.color {
            check("color", validation::validate_color(color))?;
        }
        if let Some(limit) = input.credit_limit {
            check(
                "credit_limit",
                validation::validate_amount(limit, "credit_limit"),
            )?;
        }
        let mut item: RefItem = self
            .core
            .payment_cards()
            .update(
                id,
                core::UpdatePaymentCard {
                    name: input.name,
                    card_type: input.card_type,
                    last_four: nullable_patch(input.last_four, clear_last),
                    color: input.color,
                    credit_limit: nullable_patch(input.credit_limit, clear_limit),
                },
            )?
            .into();
        item.subscription_count = self
            .core
            .subscriptions()
            .list()
            .map_err(applied)?
            .iter()
            .filter(|row| row.card_id.as_deref() == Some(id))
            .count();
        Ok(item)
    }
    fn reference_page(
        &self,
        mut rows: Vec<RefItem>,
        kind: &str,
        limit: Option<usize>,
        cursor: Option<String>,
    ) -> Result<Page<RefItem>> {
        let limit = clamp_limit(limit, ListKind::Reference)?;
        let subscriptions = self.core.subscriptions().list()?;
        let mut counts: HashMap<String, usize> = HashMap::new();
        if kind == "tags" {
            let ids: Vec<_> = subscriptions.into_iter().map(|row| row.id).collect();
            for link in self.core.tags().list_links_for_subscriptions(&ids)? {
                *counts.entry(link.tag_id).or_default() += 1;
            }
        } else {
            for row in subscriptions {
                let id = if kind == "categories" {
                    row.category_id
                } else {
                    row.card_id
                };
                if let Some(id) = id {
                    *counts.entry(id).or_default() += 1;
                }
            }
        }
        for row in &mut rows {
            row.subscription_count = counts.get(&row.id).copied().unwrap_or(0);
        }
        rows.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
        page(rows, limit, cursor.as_deref(), &kind)
    }
    fn all_tag_links(&self) -> Result<Vec<core::SubscriptionTagLink>> {
        let ids: Vec<_> = self
            .core
            .subscriptions()
            .list()?
            .into_iter()
            .map(|row| row.id)
            .collect();
        Ok(self.core.tags().list_links_for_subscriptions(&ids)?)
    }
    pub fn delete_subscription(
        &self,
        id: &str,
        confirm: bool,
        dry_run: bool,
    ) -> Result<DeleteResult> {
        let name = self.core.subscriptions().get_name(id)?;
        if !dry_run {
            require_confirmation(confirm)?;
        }
        let payments = self
            .core
            .payments()
            .list_by_subscription(id)?
            .into_iter()
            .map(|row| row.id)
            .collect();
        let history = self
            .core
            .price_history()
            .list_by_subscription(id)?
            .into_iter()
            .map(|row| row.id)
            .collect();
        let tags = self
            .core
            .tags()
            .list_links_for_subscriptions(&[id.to_owned()])?
            .into_iter()
            .map(|row| row.tag_id)
            .collect();
        let cascade = BTreeMap::from([
            ("payments".into(), cascade_preview(payments)),
            ("price_history".into(), cascade_preview(history)),
            ("tag_links".into(), cascade_preview(tags)),
        ]);
        let preview = delete_preview(id, name, cascade);
        if dry_run {
            return Ok(DeleteResult::Preview(preview));
        }
        self.core.subscriptions().delete(id)?;
        Ok(delete_outcome(preview))
    }
    pub fn delete_payment(&self, id: &str, confirm: bool, dry_run: bool) -> Result<DeleteResult> {
        let payment = self.core.payments().get(id)?;
        let sub = self.core.subscriptions().get(&payment.subscription_id)?;
        let preview = delete_preview(id, sub.name, BTreeMap::new());
        if dry_run {
            return Ok(DeleteResult::Preview(preview));
        }
        require_confirmation(confirm)?;
        self.core.payments().delete(id)?;
        Ok(delete_outcome(preview))
    }
    pub fn delete_category(&self, id: &str, confirm: bool, dry_run: bool) -> Result<DeleteResult> {
        let category = self.core.categories().get(id)?;
        if category.is_default {
            return Err(AppError::new(
                ErrorKind::Conflict,
                "default categories cannot be deleted",
            ));
        }
        if !dry_run {
            require_confirmation(confirm)?;
        }
        let ids = self
            .core
            .subscriptions()
            .list()?
            .into_iter()
            .filter(|row| row.category_id.as_deref() == Some(id))
            .map(|row| row.id)
            .collect();
        let preview = delete_preview(
            id,
            category.name,
            BTreeMap::from([("subscriptions".into(), cascade_preview(ids))]),
        );
        if dry_run {
            return Ok(DeleteResult::Preview(preview));
        }
        self.core.categories().delete(id)?;
        Ok(delete_outcome(preview))
    }
    pub fn delete_tag(&self, id: &str, confirm: bool, dry_run: bool) -> Result<DeleteResult> {
        let tag = self.core.tags().get(id)?;
        if !dry_run {
            require_confirmation(confirm)?;
        }
        let ids = self
            .all_tag_links()?
            .into_iter()
            .filter(|link| link.tag_id == id)
            .map(|link| link.subscription_id)
            .collect();
        let preview = delete_preview(
            id,
            tag.name,
            BTreeMap::from([("tag_links".into(), cascade_preview(ids))]),
        );
        if dry_run {
            return Ok(DeleteResult::Preview(preview));
        }
        self.core.tags().delete(id)?;
        Ok(delete_outcome(preview))
    }
    pub fn delete_card(&self, id: &str, confirm: bool, dry_run: bool) -> Result<DeleteResult> {
        let card = self.core.payment_cards().get(id)?;
        if !dry_run {
            require_confirmation(confirm)?;
        }
        let ids = self
            .core
            .subscriptions()
            .list()?
            .into_iter()
            .filter(|row| row.card_id.as_deref() == Some(id))
            .map(|row| row.id)
            .collect();
        let preview = delete_preview(
            id,
            card.name,
            BTreeMap::from([("subscriptions".into(), cascade_preview(ids))]),
        );
        if dry_run {
            return Ok(DeleteResult::Preview(preview));
        }
        self.core.payment_cards().delete(id)?;
        Ok(delete_outcome(preview))
    }
}
fn cascade_preview(mut ids: Vec<String>) -> CascadePreview {
    ids.sort();
    let count = ids.len();
    ids.truncate(20);
    CascadePreview { count, ids }
}
fn delete_preview(
    id: &str,
    name: String,
    cascade: BTreeMap<String, CascadePreview>,
) -> DeletePreview {
    DeletePreview {
        dry_run: true,
        target: NamedRef {
            id: id.into(),
            name,
        },
        cascade,
        requires_confirmation: true,
    }
}
fn delete_outcome(preview: DeletePreview) -> DeleteResult {
    DeleteResult::Deleted(DeleteOutcome {
        deleted: true,
        target: preview.target,
        cascade: preview
            .cascade
            .into_iter()
            .map(|(kind, rows)| (kind, CascadeCount { count: rows.count }))
            .collect(),
    })
}
